/**
 * @file PayoutService.ts
 * @description Payouts to hosts, property owners and residents via Stripe Connect.
 *
 * Earnings come from the earnings_allocations ledger (written at capture and on
 * refunds — see EarningsAllocator), so a single transaction can pay several
 * beneficiaries and refunds reduce what is paid.
 *
 * Lifecycle (weekly, triggered from the admin payouts endpoint or cron):
 *   1. schedulePayouts() — one pending payout_batches row per beneficiary whose
 *      unbatched allocations total at least MIN_PAYOUT_PENCE; the allocations
 *      are linked to the batch in the same transaction.
 *   2. processPayouts() — Stripe transfer per pending batch (idempotency key per
 *      batch, atomic claim so concurrent runs never pay twice). Batches for
 *      beneficiaries without a connected payout account stay pending until they
 *      connect one.
 *
 * @module domains/payments
 */

import { getDb, transaction } from '@/lib/db'
import { StripeService } from './StripeService'

/* ── Types ─────────────────────────────────────────────────── */

export type PayoutBatch = {
  id: string
  hostUserId: string
  hostProfileId: string | null
  periodStart: Date
  periodEnd: Date
  completedSessions: number
  grossEarningsPence: number
  platformFeePence: number
  netEarningsPence: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  stripeTransferId: string | null
  failureReason: string | null
  processedAt: Date | null
  createdAt: Date
}

export const MIN_PAYOUT_PENCE = 500 // £5.00

const AWAITING_ACCOUNT = 'Awaiting payout account — connect Stripe to receive this payout'

/** The beneficiary's Stripe Connect account, once Stripe reports payouts enabled. */
const PAYOUT_ACCOUNT_SQL = `CASE WHEN u.payouts_enabled THEN u.stripe_connect_account_id END`

/* ── Service ────────────────────────────────────────────────── */

export const PayoutService = {
  /**
   * Batches every beneficiary's unpaid earnings from transactions captured
   * before `periodEnd`. Returns the number of batches created.
   */
  async schedulePayouts(periodStart: Date, periodEnd: Date): Promise<number> {
    const db = await getDb()
    const due = await db.execute(
      `SELECT ea.beneficiary_user_id, SUM(ea.amount_pence)::INT AS total
       FROM earnings_allocations ea
       JOIN transactions t ON t.id = ea.transaction_id
       WHERE ea.payout_batch_id IS NULL AND t.captured_at < $1
       GROUP BY ea.beneficiary_user_id
       HAVING SUM(ea.amount_pence) >= $2`,
      [periodEnd.toISOString(), MIN_PAYOUT_PENCE],
    )

    let scheduled = 0
    for (const row of due.rows) {
      const userId = row['beneficiary_user_id'] as string
      try {
        await transaction(async (tx) => {
          const hp = await tx.execute(`SELECT id FROM host_profiles WHERE user_id = $1`, [userId])
          const batch = await tx.execute(
            `INSERT INTO payout_batches (host_user_id, host_profile_id, period_start, period_end, status)
             VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
            [userId, hp.rows[0]?.['id'] ?? null, periodStart.toISOString(), periodEnd.toISOString()],
          )
          const batchId = batch.rows[0]?.['id'] as string
          // Link allocations (including any refunds) and compute totals from what was linked.
          await tx.execute(
            `UPDATE earnings_allocations ea SET payout_batch_id = $1
             FROM transactions t
             WHERE t.id = ea.transaction_id AND ea.beneficiary_user_id = $2
               AND ea.payout_batch_id IS NULL AND t.captured_at < $3`,
            [batchId, userId, periodEnd.toISOString()],
          )
          const totals = await tx.execute(
            `SELECT COALESCE(SUM(ea.amount_pence), 0)::INT AS net,
                    COUNT(DISTINCT ea.transaction_id)::INT AS sessions,
                    COALESCE(SUM(t.total_charged_cents) FILTER (WHERE ea.reason = 'capture' AND ea.share <> 'resident'), 0)::INT AS gross,
                    COALESCE(SUM(t.platform_fee_cents) FILTER (WHERE ea.reason = 'capture' AND ea.share <> 'resident'), 0)::INT AS fee
             FROM earnings_allocations ea JOIN transactions t ON t.id = ea.transaction_id
             WHERE ea.payout_batch_id = $1`,
            [batchId],
          )
          const tRow = totals.rows[0] ?? {}
          await tx.execute(
            `UPDATE payout_batches
             SET net_earnings_pence = $2, completed_sessions = $3,
                 gross_earnings_pence = $4, platform_fee_pence = $5, updated_at = NOW()
             WHERE id = $1`,
            [batchId, tRow['net'], tRow['sessions'], tRow['gross'], tRow['fee']],
          )
          // Keep the per-transaction marker in step for reporting.
          await tx.execute(
            `UPDATE transactions SET payout_batch_id = $1, updated_at = NOW()
             WHERE id IN (SELECT transaction_id FROM earnings_allocations WHERE payout_batch_id = $1)
               AND payout_batch_id IS NULL`,
            [batchId],
          )
        })
        scheduled++
      } catch (err) {
        console.error(`[PayoutService] Failed to schedule payout for ${userId}`, err)
      }
    }
    return scheduled
  },

  /** Executes Stripe transfers for pending batches. */
  async processPayouts(): Promise<{ processed: number; failed: number; awaitingAccount: number }> {
    const db = await getDb()
    const batches = await db.execute(
      `SELECT pb.id, pb.host_user_id, pb.net_earnings_pence, pb.period_start, pb.period_end,
              ${PAYOUT_ACCOUNT_SQL} AS account
       FROM payout_batches pb JOIN users u ON u.id = pb.host_user_id
       WHERE pb.status IN ('pending', 'failed') AND pb.net_earnings_pence > 0
       ORDER BY pb.created_at ASC
       LIMIT 100`,
    )

    let processed = 0
    let failed = 0
    let awaitingAccount = 0

    for (const b of batches.rows) {
      const account = b['account'] as string | null
      if (!account) {
        await db.execute(
          `UPDATE payout_batches SET failure_reason = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'pending'`,
          [b['id'], AWAITING_ACCOUNT],
        )
        awaitingAccount++
        continue
      }

      const claim = await db.execute(
        `UPDATE payout_batches SET status = 'processing', failure_reason = NULL, updated_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'failed') RETURNING id`,
        [b['id']],
      )
      if (claim.rows.length === 0) continue

      const period = `${new Date(b['period_start'] as string).toLocaleDateString('en-GB')} – ${new Date(b['period_end'] as string).toLocaleDateString('en-GB')}`
      try {
        const transfer = await StripeService.createTransfer(
          Number(b['net_earnings_pence']),
          account,
          `Zipgrid earnings ${period}`,
          { payout_batch_id: b['id'] as string, user_id: b['host_user_id'] as string },
          `payout-${b['id'] as string}`,
        )
        await db.execute(
          `UPDATE payout_batches SET status = 'completed', stripe_transfer_id = $2,
                  processed_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [b['id'], transfer.id],
        )
        processed++
      } catch (err) {
        await db.execute(
          `UPDATE payout_batches SET status = 'failed', failure_reason = $2, updated_at = NOW() WHERE id = $1`,
          [b['id'], (err instanceof Error ? err.message : 'Unknown Stripe error').slice(0, 500)],
        )
        failed++
      }
    }
    return { processed, failed, awaitingAccount }
  },

  /** Payout history for a beneficiary. */
  async getPayoutHistory(userId: string, page = 1, pageSize = 20): Promise<{ batches: PayoutBatch[]; total: number }> {
    const db = await getDb()
    const [countRes, batchRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM payout_batches WHERE host_user_id = $1`, [userId]),
      db.execute(
        `SELECT id, host_user_id, host_profile_id, period_start, period_end,
                completed_sessions, gross_earnings_pence, platform_fee_pence,
                net_earnings_pence, status, stripe_transfer_id,
                failure_reason, processed_at, created_at
         FROM payout_batches WHERE host_user_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, pageSize, (Math.max(1, page) - 1) * pageSize],
      ),
    ])
    return {
      batches: batchRes.rows.map((r) => this._mapBatch(r)),
      total: Number((countRes.rows[0] as { total: number }).total),
    }
  },

  /** Lifetime and pending earnings for a beneficiary, from the ledger. */
  async getEarningsSummary(userId: string): Promise<{
    lifetimeNetPence: number
    pendingPence: number
    paidPence: number
    transactions: number
  }> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT COALESCE(SUM(ea.amount_pence), 0)::INT AS net,
              COALESCE(SUM(ea.amount_pence) FILTER (WHERE ea.payout_batch_id IS NULL), 0)::INT AS pending,
              COALESCE(SUM(ea.amount_pence) FILTER (WHERE pb.status = 'completed'), 0)::INT AS paid,
              COUNT(DISTINCT ea.transaction_id)::INT AS txns
       FROM earnings_allocations ea
       LEFT JOIN payout_batches pb ON pb.id = ea.payout_batch_id
       WHERE ea.beneficiary_user_id = $1`,
      [userId],
    )
    const r = res.rows[0] ?? {}
    return {
      lifetimeNetPence: Number(r['net'] ?? 0),
      pendingPence: Number(r['pending'] ?? 0),
      paidPence: Number(r['paid'] ?? 0),
      transactions: Number(r['txns'] ?? 0),
    }
  },

  _mapBatch(r: Record<string, unknown>): PayoutBatch {
    return {
      id: r['id'] as string,
      hostUserId: r['host_user_id'] as string,
      hostProfileId: (r['host_profile_id'] as string | null) ?? null,
      periodStart: new Date(r['period_start'] as string),
      periodEnd: new Date(r['period_end'] as string),
      completedSessions: Number(r['completed_sessions'] ?? 0),
      grossEarningsPence: Number(r['gross_earnings_pence'] ?? 0),
      platformFeePence: Number(r['platform_fee_pence'] ?? 0),
      netEarningsPence: Number(r['net_earnings_pence'] ?? 0),
      status: r['status'] as PayoutBatch['status'],
      stripeTransferId: (r['stripe_transfer_id'] as string | null) ?? null,
      failureReason: (r['failure_reason'] as string | null) ?? null,
      processedAt: r['processed_at'] ? new Date(r['processed_at'] as string) : null,
      createdAt: new Date(r['created_at'] as string),
    }
  },
}
