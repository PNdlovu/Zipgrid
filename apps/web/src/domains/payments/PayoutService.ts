/**
 * @file PayoutService.ts
 * @description Host payout service — calculates earnings, schedules weekly payouts,
 * and transfers funds via Stripe Connect to hosts' bank accounts.
 *
 * Payout schedule: every Monday for the previous week (Mon–Sun).
 * Minimum payout threshold: £5.00 (500p).
 * Platform fee: 15% (taken at session completion — stored in transactions.platform_fee_cents).
 *
 * Lifecycle:
 *   1. calculateHostPayout()  — aggregates completed transactions for a period
 *   2. schedulePayouts()      — creates pending payout_batches rows
 *   3. processPayouts()       — executes Stripe Connect transfers for all pending batches
 *
 * @module domains/payments
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { StripeService } from './StripeService'
import { ValidationError, NotFoundError } from '@/lib/errors/AppError'

/* ── Types ─────────────────────────────────────────────────── */

export type PayoutSummary = {
  hostUserId: string
  hostProfileId: string
  stripeConnectAccountId: string | null
  periodStart: Date
  periodEnd: Date
  completedSessions: number
  grossEarningsPence: number
  platformFeePence: number
  netEarningsPence: number
  alreadyPaidPence: number
  pendingPence: number
}

export type PayoutBatch = {
  id: string
  hostUserId: string
  hostProfileId: string
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

const MIN_PAYOUT_PENCE = 500 // £5.00

/* ── Service ────────────────────────────────────────────────── */

export const PayoutService = {

  /**
   * Calculates a host's pending earnings for a given period.
   * Aggregates transactions.host_earnings_cents for completed sessions
   * that haven't been included in a payout batch yet.
   */
  async calculateHostPayout(
    hostUserId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PayoutSummary> {
    const db = await getDb()

    // Resolve host_profile_id + Stripe Connect account
    const profileRes = await db.execute(
      `SELECT hp.id AS host_profile_id, hp.stripe_connect_account_id
       FROM host_profiles hp
       WHERE hp.user_id = $1 LIMIT 1`,
      [hostUserId],
    )
    if (profileRes.rows.length === 0) {
      throw new NotFoundError('Host profile', hostUserId)
    }
    const profile = profileRes.rows[0] as {
      host_profile_id: string
      stripe_connect_account_id: string | null
    }

    // Sum completed transactions in the period not yet batched
    const earningsRes = await db.execute(
      `SELECT
         COUNT(*)::INT AS session_count,
         COALESCE(SUM(t.total_charged_cents), 0)::INT AS gross,
         COALESCE(SUM(t.platform_fee_cents), 0)::INT AS fee,
         COALESCE(SUM(t.host_earnings_cents), 0)::INT AS net
       FROM transactions t
       JOIN bookings b ON b.id = t.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE hp.user_id = $1
         AND t.status = 'captured'
         AND t.captured_at >= $2 AND t.captured_at < $3
         AND t.payout_batch_id IS NULL`,
      [hostUserId, periodStart.toISOString(), periodEnd.toISOString()],
    )

    const earnings = earningsRes.rows[0] as {
      session_count: number
      gross: number
      fee: number
      net: number
    }

    // Already paid in this period
    const alreadyPaidRes = await db.execute(
      `SELECT COALESCE(SUM(net_earnings_pence), 0)::INT AS paid
       FROM payout_batches
       WHERE host_user_id = $1
         AND period_start >= $2 AND period_end <= $3
         AND status = 'completed'`,
      [hostUserId, periodStart.toISOString(), periodEnd.toISOString()],
    )
    const alreadyPaid = (alreadyPaidRes.rows[0] as { paid: number }).paid

    return {
      hostUserId,
      hostProfileId: profile.host_profile_id,
      stripeConnectAccountId: profile.stripe_connect_account_id,
      periodStart,
      periodEnd,
      completedSessions: earnings.session_count,
      grossEarningsPence: earnings.gross,
      platformFeePence: earnings.fee,
      netEarningsPence: earnings.net,
      alreadyPaidPence: alreadyPaid,
      pendingPence: Math.max(0, earnings.net - alreadyPaid),
    }
  },

  /**
   * Creates payout_batches rows for all hosts with pending earnings above threshold.
   * Called by pg_cron every Monday at 08:00 UTC via the `/api/v1/admin/payouts` route.
   *
   * @param periodStart - Start of payout period (usually last Monday 00:00 UTC)
   * @param periodEnd   - End of payout period (this Monday 00:00 UTC)
   * @returns Number of hosts scheduled for payout
   */
  async schedulePayouts(periodStart: Date, periodEnd: Date): Promise<number> {
    const db = await getDb()

    // Find all hosts with unpaid captured transactions in this period
    const hostsRes = await db.execute(
      `SELECT DISTINCT hp.user_id
       FROM transactions t
       JOIN bookings b ON b.id = t.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE t.status = 'captured'
         AND t.captured_at >= $1 AND t.captured_at < $2
         AND t.payout_batch_id IS NULL`,
      [periodStart.toISOString(), periodEnd.toISOString()],
    )

    let scheduled = 0

    for (const row of hostsRes.rows) {
      const hostUserId = (row as { user_id: string }).user_id
      try {
        const summary = await this.calculateHostPayout(hostUserId, periodStart, periodEnd)
        if (summary.pendingPence < MIN_PAYOUT_PENCE) continue

        const batchId = uuidv4()
        await db.execute(
          `INSERT INTO payout_batches (
             id, host_user_id, host_profile_id,
             period_start, period_end,
             completed_sessions, gross_earnings_pence,
             platform_fee_pence, net_earnings_pence,
             status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [
            batchId,
            hostUserId,
            summary.hostProfileId,
            periodStart.toISOString(),
            periodEnd.toISOString(),
            summary.completedSessions,
            summary.grossEarningsPence,
            summary.platformFeePence,
            summary.pendingPence,
          ],
        )

        // Link transactions to this batch
        await db.execute(
          `UPDATE transactions
           SET payout_batch_id = $1, updated_at = NOW()
           WHERE id IN (
             SELECT t.id FROM transactions t
             JOIN bookings b ON b.id = t.booking_id
             JOIN charger_listings cl ON cl.id = b.listing_id
             JOIN host_profiles hp ON hp.id = cl.host_profile_id
             WHERE hp.user_id = $2
               AND t.status = 'captured'
               AND t.captured_at >= $3 AND t.captured_at < $4
               AND t.payout_batch_id IS NULL
           )`,
          [batchId, hostUserId, periodStart.toISOString(), periodEnd.toISOString()],
        )

        scheduled++
      } catch {
        // Log and continue — one bad host profile shouldn't block others
        console.error(`[PayoutService] Failed to schedule payout for host ${hostUserId}`)
      }
    }

    return scheduled
  },

  /**
   * Processes all pending payout batches via Stripe Connect transfers.
   * Called immediately after schedulePayouts() or by a retry cron.
   *
   * @returns { processed, failed } counts
   */
  async processPayouts(): Promise<{ processed: number; failed: number }> {
    const db = await getDb()

    const batchesRes = await db.execute(
      `SELECT pb.id, pb.host_user_id, pb.net_earnings_pence, pb.period_start, pb.period_end,
              hp.stripe_connect_account_id
       FROM payout_batches pb
       JOIN host_profiles hp ON hp.id = pb.host_profile_id
       WHERE pb.status = 'pending'
       ORDER BY pb.created_at ASC
       LIMIT 100`,
      [],
    )

    let processed = 0
    let failed = 0

    for (const row of batchesRes.rows) {
      const batch = row as {
        id: string
        host_user_id: string
        net_earnings_pence: number
        period_start: string
        period_end: string
        stripe_connect_account_id: string | null
      }

      if (!batch.stripe_connect_account_id) {
        // Host hasn't completed Stripe onboarding — mark failed, notify
        await db.execute(
          `UPDATE payout_batches
           SET status = 'failed',
               failure_reason = 'Host Stripe Connect account not set up',
               updated_at = NOW()
           WHERE id = $1`,
          [batch.id],
        )
        failed++
        continue
      }

      // Mark as processing
      await db.execute(
        `UPDATE payout_batches SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [batch.id],
      )

      try {
        const periodLabel = `${new Date(batch.period_start).toLocaleDateString('en-GB')} – ${new Date(batch.period_end).toLocaleDateString('en-GB')}`

        const transfer = await StripeService.createTransfer(
          batch.net_earnings_pence,
          batch.stripe_connect_account_id,
          `Zipgrid host earnings: ${periodLabel}`,
          {
            payout_batch_id: batch.id,
            host_user_id: batch.host_user_id,
            period: periodLabel,
          },
        )

        await db.execute(
          `UPDATE payout_batches
           SET status = 'completed',
               stripe_transfer_id = $2,
               processed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [batch.id, transfer.id],
        )

        // Create a payout transaction record for the host
        await db.execute(
          `INSERT INTO transactions (
             id, status, subtotal_cents, platform_fee_cents,
             total_charged_cents, host_earnings_cents,
             payout_batch_id, commission_rate_pct, currency,
             created_at, updated_at
           ) VALUES ($1, 'payout_sent', $2, 0, $2, $2, $3, 0, 'GBP', NOW(), NOW())`,
          [uuidv4(), batch.net_earnings_pence, batch.id],
        )

        processed++
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown Stripe error'
        await db.execute(
          `UPDATE payout_batches
           SET status = 'failed',
               failure_reason = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [batch.id, reason],
        )
        failed++
      }
    }

    return { processed, failed }
  },

  /**
   * Returns payout history for a host.
   */
  async getPayoutHistory(
    hostUserId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ batches: PayoutBatch[]; total: number }> {
    const db = await getDb()
    const offset = (page - 1) * pageSize

    const [countRes, batchRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total FROM payout_batches WHERE host_user_id = $1`,
        [hostUserId],
      ),
      db.execute(
        `SELECT id, host_user_id, host_profile_id, period_start, period_end,
                completed_sessions, gross_earnings_pence, platform_fee_pence,
                net_earnings_pence, status, stripe_transfer_id,
                failure_reason, processed_at, created_at
         FROM payout_batches
         WHERE host_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [hostUserId, pageSize, offset],
      ),
    ])

    return {
      batches: batchRes.rows.map((r) => this._mapBatch(r as Record<string, unknown>)),
      total: (countRes.rows[0] as { total: number }).total,
    }
  },

  /**
   * Returns lifetime earnings summary for a host.
   */
  async getEarningsSummary(hostUserId: string): Promise<{
    lifetimeGrossPence: number
    lifetimePlatformFeePence: number
    lifetimeNetPence: number
    pendingPence: number
    completedSessions: number
  }> {
    const db = await getDb()

    const res = await db.execute(
      `SELECT
         COALESCE(SUM(t.total_charged_cents), 0)::INT AS gross,
         COALESCE(SUM(t.platform_fee_cents), 0)::INT AS fee,
         COALESCE(SUM(t.host_earnings_cents), 0)::INT AS net,
         COUNT(*)::INT AS sessions
       FROM transactions t
       JOIN bookings b ON b.id = t.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE hp.user_id = $1 AND t.status = 'captured'`,
      [hostUserId],
    )

    const pendingRes = await db.execute(
      `SELECT COALESCE(SUM(t.host_earnings_cents), 0)::INT AS pending
       FROM transactions t
       JOIN bookings b ON b.id = t.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE hp.user_id = $1 AND t.status = 'captured' AND t.payout_batch_id IS NULL`,
      [hostUserId],
    )

    const s = res.rows[0] as { gross: number; fee: number; net: number; sessions: number }
    const pending = (pendingRes.rows[0] as { pending: number }).pending

    return {
      lifetimeGrossPence: s.gross,
      lifetimePlatformFeePence: s.fee,
      lifetimeNetPence: s.net,
      pendingPence: pending,
      completedSessions: s.sessions,
    }
  },

  _mapBatch(r: Record<string, unknown>): PayoutBatch {
    return {
      id: r['id'] as string,
      hostUserId: r['host_user_id'] as string,
      hostProfileId: r['host_profile_id'] as string,
      periodStart: new Date(r['period_start'] as string),
      periodEnd: new Date(r['period_end'] as string),
      completedSessions: Number(r['completed_sessions']),
      grossEarningsPence: Number(r['gross_earnings_pence']),
      platformFeePence: Number(r['platform_fee_pence']),
      netEarningsPence: Number(r['net_earnings_pence']),
      status: r['status'] as PayoutBatch['status'],
      stripeTransferId: (r['stripe_transfer_id'] as string | null) ?? null,
      failureReason: (r['failure_reason'] as string | null) ?? null,
      processedAt: r['processed_at'] ? new Date(r['processed_at'] as string) : null,
      createdAt: new Date(r['created_at'] as string),
    }
  },
}
