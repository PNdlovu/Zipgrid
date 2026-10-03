/**
 * @file SettlementService.ts
 * @description Turns a completed charging session into collected money.
 *
 * settleSession() is the only code path that captures a charging hold. It is
 * idempotent and safe to call repeatedly (OCPP webhook, manual stop, cron):
 *   - the transaction row is locked FOR UPDATE and only `hold_placed` rows settle
 *   - Stripe calls carry an idempotency key derived from the transaction id
 *   - failures leave the row in `hold_placed` with capture_error set, so the
 *     settlement cron retries them
 *
 * Rules:
 *   - capture = min(final cost, authorised hold)
 *   - revenue is split at the commission rate snapshotted on the transaction
 *     (the host's plan rate when payment was secured)
 *   - the host is paid for the full session: earnings are split from the final
 *     cost, and any excess over the hold opens a payment_shortfalls row that
 *     ShortfallService collects from the driver (wallet, then card) after commit
 *   - card: below Stripe's 50p minimum the hold is released instead of captured
 *   - wallet (payment_source = 'wallet'): the charge is debited from the wallet
 *     and the reservation dropped in the same DB transaction; only a zero-cost
 *     session is released
 *
 * @module domains/payments
 */

import { splitRevenue } from '@zipgrid/utils'
import { transaction } from '@/lib/db'
import { eventBus } from '@/lib/events/event-bus'
import { StripeService } from '@/domains/payments/StripeService'
import { EarningsAllocator } from '@/domains/payments/EarningsAllocator'
import { WalletService } from '@/domains/payments/WalletService'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { AutoTopupService } from '@/domains/payments/AutoTopupService'

export type SettlementOutcome =
  | { status: 'captured'; amountPence: number; shortfallPence: number }
  | { status: 'released' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

/** Sessions still charging can't be settled. */
const SETTLEABLE_SESSION_STATUSES = ['completed', 'faulted']
/** Stripe's minimum GBP charge. */
const STRIPE_MIN_CHARGE_PENCE = 50

/** Work to do after the settlement transaction commits (it calls Stripe). */
type FollowUp = { driverUserId: string; shortfallId: string | null; walletDebited: boolean }

export const SettlementService = {
  async settleSession(sessionId: string): Promise<SettlementOutcome> {
    const { outcome, followUp } = await this._settleLocked(sessionId)
    if (followUp) {
      try {
        if (followUp.shortfallId) await ShortfallService.collect(followUp.shortfallId)
        if (followUp.walletDebited) await AutoTopupService.afterDebit(followUp.driverUserId)
      } catch (err) {
        // Settlement is committed; the cron retries shortfall collection.
        console.error('[SettlementService.settleSession] follow-up failed', sessionId, err)
      }
    }
    return outcome
  },

  async _settleLocked(sessionId: string): Promise<{ outcome: SettlementOutcome; followUp: FollowUp | null }> {
    return transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT t.id AS transaction_id, t.status AS txn_status, t.stripe_payment_intent_id, t.payment_source,
                COALESCE(t.commission_rate_pct, 15) AS commission_rate_pct,
                COALESCE(t.authorized_cents, t.subtotal_cents, 0) AS authorized_cents,
                cs.id AS session_id, cs.status AS session_status, cs.booking_id,
                COALESCE(cs.total_session_cost_cents, 0) AS final_cents,
                COALESCE(cs.energy_cost_cents, 0) AS energy_cents,
                COALESCE(cs.idle_fee_cents, 0) AS idle_cents,
                COALESCE(cs.energy_consumed_wh, 0) AS energy_wh,
                dp.user_id AS driver_user_id
         FROM charging_sessions cs
         JOIN bookings b         ON b.id = cs.booking_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         JOIN transactions t     ON t.booking_id = cs.booking_id
         WHERE cs.id = $1
         FOR UPDATE OF t`,
        [sessionId],
      )
      const row = res.rows[0] as {
        transaction_id: string
        txn_status: string
        stripe_payment_intent_id: string | null
        payment_source: 'card' | 'wallet'
        commission_rate_pct: number
        authorized_cents: number
        session_status: string
        booking_id: string
        final_cents: number
        energy_cents: number
        idle_cents: number
        energy_wh: number
        driver_user_id: string
      } | undefined

      const skip = (reason: string) => ({ outcome: { status: 'skipped', reason } as const, followUp: null })
      if (!row) return skip('no_transaction')
      if (row.txn_status !== 'hold_placed') return skip(`already_${row.txn_status}`)
      if (!SETTLEABLE_SESSION_STATUSES.includes(row.session_status)) return skip(`session_${row.session_status}`)

      const finalCents = Math.max(0, Number(row.final_cents))
      const authorized = Number(row.authorized_cents)
      const captureCents = Math.min(finalCents, authorized)
      const shortfallCents = finalCents - captureCents
      const isWallet = row.payment_source === 'wallet'
      const release = captureCents < (isWallet ? 1 : STRIPE_MIN_CHARGE_PENCE)

      if (isWallet) {
        // Same DB transaction as the bookkeeping below: all or nothing.
        if (release) await WalletService.release(tx, row.driver_user_id, authorized)
        else await WalletService.settle(tx, row.driver_user_id, row.booking_id, authorized, captureCents)
      } else {
        try {
          if (release) {
            await StripeService.cancelPaymentIntent(row.stripe_payment_intent_id!, 'abandoned')
          } else {
            await StripeService.capturePaymentIntent({
              paymentIntentId: row.stripe_payment_intent_id!,
              finalAmountPence: captureCents,
              idempotencyKey: `settle-${row.transaction_id}`,
            })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await tx.execute(
            `UPDATE transactions
             SET capture_error = $2, capture_attempts = capture_attempts + 1, updated_at = NOW()
             WHERE id = $1`,
            [row.transaction_id, message.slice(0, 500)],
          )
          return { outcome: { status: 'failed', error: message } as const, followUp: null }
        }
      }

      if (release) {
        await tx.execute(
          `UPDATE transactions
           SET status = 'fully_refunded', total_charged_cents = 0, platform_fee_cents = 0,
               host_earnings_cents = 0, refund_reason = $4,
               session_id = $2, energy_kwh_delivered = $3, capture_error = NULL,
               refunded_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.transaction_id, sessionId, Number(row.energy_wh) / 1000,
           captureCents === 0 ? 'zero_cost_session' : 'below_minimum_charge'],
        )
        await this._completeBooking(tx, row.booking_id)
        return { outcome: { status: 'released' } as const, followUp: null }
      }

      // Host is paid for the whole session; the shortfall is the platform's to recover.
      const { platformFeePence, hostEarningsPence } = splitRevenue(finalCents, Number(row.commission_rate_pct) / 100)
      await tx.execute(
        `UPDATE transactions
         SET status = 'captured', session_id = $2,
             total_charged_cents = $3, platform_fee_cents = $4, host_earnings_cents = $5,
             energy_cost_cents = $6, idle_fee_cents = $7,
             energy_kwh_delivered = $8, shortfall_cents = $9,
             capture_error = NULL, captured_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [
          row.transaction_id, sessionId, captureCents, platformFeePence, hostEarningsPence,
          Number(row.energy_cents), Number(row.idle_cents), Number(row.energy_wh) / 1000,
          shortfallCents,
        ],
      )
      await EarningsAllocator.allocateCapture(tx, row.transaction_id, hostEarningsPence)
      const shortfallId = await ShortfallService.open(tx, row.transaction_id, row.driver_user_id, shortfallCents)
      await this._completeBooking(tx, row.booking_id)

      eventBus.publish({
        type: 'PAYMENT_CAPTURED',
        transactionId: row.transaction_id,
        amountPence: captureCents,
        driverId: row.driver_user_id,
      })
      return {
        outcome: { status: 'captured', amountPence: captureCents, shortfallPence: shortfallCents } as const,
        followUp: { driverUserId: row.driver_user_id, shortfallId, walletDebited: isWallet },
      }
    })
  },

  async _completeBooking(
    tx: { execute: (q: string, p?: unknown[]) => Promise<unknown> },
    bookingId: string,
  ): Promise<void> {
    await tx.execute(
      `UPDATE bookings SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND status IN ('confirmed', 'active')`,
      [bookingId],
    )
  },

  /**
   * Retries settlement for sessions that ended but whose hold is still open
   * (lost webhook, Stripe outage, Stripe not yet configured). Called by cron.
   * `walletOnly` restricts it to wallet payments (used when Stripe is not configured).
   */
  async settlePending(limit = 50, walletOnly = false): Promise<{ attempted: number; captured: number; failed: number }> {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const res = await db.execute(
      `SELECT cs.id
       FROM transactions t
       JOIN charging_sessions cs ON cs.booking_id = t.booking_id
       WHERE t.status = 'hold_placed'
         AND cs.status IN ('completed', 'faulted')
         AND t.capture_attempts < 10
         AND ($2::BOOLEAN = FALSE OR t.payment_source = 'wallet')
       ORDER BY t.created_at
       LIMIT $1`,
      [limit, walletOnly],
    )
    let captured = 0
    let failed = 0
    for (const r of res.rows) {
      const outcome = await this.settleSession(r['id'] as string)
      if (outcome.status === 'captured' || outcome.status === 'released') captured++
      if (outcome.status === 'failed') failed++
    }
    return { attempted: res.rows.length, captured, failed }
  },

  /**
   * Bookings whose slot ended over an hour ago without any session that
   * delivered (or attempted) charging are marked no_show and their hold is
   * released. Called by cron.
   */
  async releaseExpiredHolds(limit = 50, walletOnly = false): Promise<{ released: number; failed: number }> {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const res = await db.execute(
      `SELECT b.id AS booking_id, t.id AS transaction_id, t.stripe_payment_intent_id,
              t.payment_source, COALESCE(t.authorized_cents, 0) AS authorized_cents,
              dp.user_id AS driver_user_id
       FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       JOIN transactions t ON t.booking_id = b.id AND t.status = 'hold_placed'
       WHERE b.status IN ('pending', 'confirmed')
         AND b.scheduled_end < NOW() - INTERVAL '1 hour'
         AND NOT EXISTS (
           SELECT 1 FROM charging_sessions cs
           WHERE cs.booking_id = b.id
             AND cs.status IN ('completed', 'faulted', 'charging', 'paused', 'finishing')
         )
         AND ($2::BOOLEAN = FALSE OR t.payment_source = 'wallet')
       ORDER BY b.scheduled_end
       LIMIT $1`,
      [limit, walletOnly],
    )
    let released = 0
    let failed = 0
    for (const r of res.rows) {
      const isWallet = r['payment_source'] === 'wallet'
      try {
        if (!isWallet) await StripeService.cancelPaymentIntent(r['stripe_payment_intent_id'] as string, 'abandoned')
        await transaction(async (tx) => {
          const upd = await tx.execute(
            `UPDATE transactions
             SET status = 'fully_refunded', refund_reason = 'no_show_hold_released',
                 refunded_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND status = 'hold_placed'
             RETURNING id`,
            [r['transaction_id']],
          )
          // Only the run that flips the status releases the reservation.
          if (isWallet && upd.rows.length > 0) {
            await WalletService.release(tx, r['driver_user_id'] as string, Number(r['authorized_cents']))
          }
          await tx.execute(
            `UPDATE bookings SET status = 'no_show', updated_at = NOW()
             WHERE id = $1 AND status IN ('pending', 'confirmed')`,
            [r['booking_id']],
          )
        })
        released++
      } catch (err) {
        console.error('[SettlementService.releaseExpiredHolds]', r['booking_id'], err)
        failed++
      }
    }
    return { released, failed }
  },
}
