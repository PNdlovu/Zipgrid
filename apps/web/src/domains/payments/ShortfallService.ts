/**
 * @file ShortfallService.ts
 * @description Collects session costs above the payment hold/reservation.
 *
 * Policy: the host is paid for the full session at settlement (SettlementService
 * allocates earnings on the final cost). The uncollected difference becomes a
 * payment_shortfalls row that the platform recovers from the driver:
 *   1. from the driver's available wallet balance
 *   2. from the driver's default card, off-session (amounts ≥ 50p)
 * Anything still unpaid stays open: it blocks new bookings (BookingService) and
 * is taken from the wallet automatically on the next top-up. The settlement
 * cron retries card collection every RETRY_INTERVAL_HOURS, up to MAX_ATTEMPTS.
 *
 * Damage charges (kind 'damage', opened by DisputeService when a host's damage
 * claim is upheld) are collected the same way. They do not change the session
 * transaction's totals; each amount collected is credited to the host in full
 * as an earnings allocation, paid out with their next payout.
 *
 * @module domains/payments
 */

import { getDb, transaction, type Db } from '@/lib/db'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { WalletService } from '@/domains/payments/WalletService'

const STRIPE_MIN_CHARGE_PENCE = 50
export const MAX_ATTEMPTS = 5
export const RETRY_INTERVAL_HOURS = 6

export type CollectOptions = { useCard?: boolean }

export type ShortfallKind = 'session' | 'damage'

/** How each kind appears on wallet statements and card descriptors. */
const LABEL: Record<ShortfallKind, string> = {
  session: 'Outstanding session balance',
  damage: 'Damage charge',
}

const fmt = (pence: number) => `£${(pence / 100).toFixed(2)}`

export const ShortfallService = {
  /** Records a shortfall inside the settlement transaction (idempotent per transaction). */
  async open(tx: Db, transactionId: string, userId: string, amountPence: number): Promise<string | null> {
    if (amountPence <= 0) return null
    const res = await tx.execute(
      `INSERT INTO payment_shortfalls (transaction_id, user_id, amount_pence) VALUES ($1, $2, $3)
       ON CONFLICT (transaction_id) WHERE kind = 'session' DO NOTHING RETURNING id`,
      [transactionId, userId, amountPence],
    )
    return (res.rows[0]?.['id'] as string | undefined) ?? null
  },

  /** Total the user still owes across open shortfalls. */
  async outstandingPence(userId: string, db?: Db): Promise<number> {
    const conn = db ?? (await getDb())
    const res = await conn.execute(
      `SELECT COALESCE(SUM(amount_pence - collected_pence), 0)::INT AS owed
       FROM payment_shortfalls WHERE user_id = $1 AND status = 'open'`,
      [userId],
    )
    return Number(res.rows[0]?.['owed'] ?? 0)
  },

  /**
   * Tries to collect one shortfall: wallet first, then (optionally) the card.
   * Returns the amount still owed. Never throws for payment failures.
   */
  async collect(shortfallId: string, { useCard = true }: CollectOptions = {}): Promise<number> {
    const state = await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT s.user_id, s.amount_pence, s.collected_pence, s.attempts, s.transaction_id, s.kind, t.booking_id
         FROM payment_shortfalls s JOIN transactions t ON t.id = s.transaction_id
         WHERE s.id = $1 AND s.status = 'open'
         FOR UPDATE OF s`,
        [shortfallId],
      )
      const r = res.rows[0]
      if (!r) return null
      const userId = r['user_id'] as string
      const remaining = Number(r['amount_pence']) - Number(r['collected_pence'])
      const fromWallet = await WalletService.debitAvailable(tx, userId, r['booking_id'] as string, remaining, LABEL[r['kind'] as ShortfallKind])
      if (fromWallet > 0) await this._applyPayment(tx, shortfallId, r['transaction_id'] as string, fromWallet, null)
      return { userId, remaining: remaining - fromWallet, attempts: Number(r['attempts']), kind: r['kind'] as ShortfallKind }
    })
    if (!state || state.remaining === 0) return 0
    if (!useCard || state.remaining < STRIPE_MIN_CHARGE_PENCE || !StripeService.isConfigured()) return state.remaining

    const card = await StripeCustomer.defaultCard(state.userId)
    if (!card) {
      await this._recordAttempt(shortfallId, state.userId, state.attempts, state.remaining, 'No saved card', state.kind)
      return state.remaining
    }

    try {
      const charge = await StripeService.chargeOffSession({
        amountPence: state.remaining,
        stripeCustomerId: card.customerId,
        paymentMethodId: card.paymentMethodId,
        description: `Zipgrid ${LABEL[state.kind].toLowerCase()} ${fmt(state.remaining)}`,
        metadata: { purpose: 'shortfall', shortfall_id: shortfallId },
        idempotencyKey: `shortfall-${shortfallId}-${state.attempts + 1}`,
      })
      if (charge.status === 'succeeded') {
        await this.applyCardPayment(shortfallId, state.remaining, charge.paymentIntentId)
        return 0
      }
      if (charge.status === 'processing') return state.remaining // webhook applies it
      await StripeService.cancelPaymentIntent(charge.paymentIntentId, 'abandoned').catch(() => {})
      await this._recordAttempt(shortfallId, state.userId, state.attempts, state.remaining, 'Bank authentication required', state.kind)
    } catch (err) {
      const message = StripeService.isCardError(err) ? err.message : 'Payment provider unavailable'
      if (!StripeService.isCardError(err)) console.error('[ShortfallService.collect]', shortfallId, err)
      await this._recordAttempt(shortfallId, state.userId, state.attempts, state.remaining, message, state.kind)
    }
    return state.remaining
  },

  /** Applies a successful card charge (sync result or webhook); idempotent per PaymentIntent. */
  async applyCardPayment(shortfallId: string, amountPence: number, stripePiId: string): Promise<void> {
    await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT transaction_id, stripe_pi_id FROM payment_shortfalls WHERE id = $1 AND status = 'open' FOR UPDATE`,
        [shortfallId],
      )
      const r = res.rows[0]
      if (!r || r['stripe_pi_id'] === stripePiId) return
      await this._applyPayment(tx, shortfallId, r['transaction_id'] as string, amountPence, stripePiId)
    })
  },

  /** Clears the user's open shortfalls from their wallet (e.g. right after a top-up). Never throws. */
  async collectFromWallet(userId: string): Promise<void> {
    try {
      const db = await getDb()
      const res = await db.execute(
        `SELECT id FROM payment_shortfalls WHERE user_id = $1 AND status = 'open' ORDER BY created_at`,
        [userId],
      )
      for (const r of res.rows) await this.collect(r['id'] as string, { useCard: false })
    } catch (err) {
      console.error('[ShortfallService.collectFromWallet]', userId, err)
    }
  },

  /** Retries open shortfalls whose last attempt is old enough. Called by the settlement cron. */
  async collectDue(limit = 50): Promise<{ attempted: number; collected: number }> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id FROM payment_shortfalls
       WHERE status = 'open' AND attempts < $1
         AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - make_interval(hours => $2))
       ORDER BY created_at
       LIMIT $3`,
      [MAX_ATTEMPTS, RETRY_INTERVAL_HOURS, limit],
    )
    let collected = 0
    for (const r of res.rows) {
      if ((await this.collect(r['id'] as string)) === 0) collected++
    }
    return { attempted: res.rows.length, collected }
  },

  async _applyPayment(tx: Db, shortfallId: string, transactionId: string, amountPence: number, stripePiId: string | null) {
    const updated = await tx.execute(
      `UPDATE payment_shortfalls
       SET collected_pence = LEAST(amount_pence, collected_pence + $2),
           stripe_pi_id = COALESCE($3, stripe_pi_id),
           status = CASE WHEN collected_pence + $2 >= amount_pence THEN 'collected' ELSE status END,
           resolved_at = CASE WHEN collected_pence + $2 >= amount_pence THEN NOW() ELSE resolved_at END
       WHERE id = $1
       RETURNING kind, collected_pence`,
      [shortfallId, amountPence, stripePiId],
    )
    if (updated.rows[0]?.['kind'] === 'damage') {
      // Damage recovered from the driver goes to the host in full (no platform fee).
      // The reason is unique per collection step, so partial payments each get a row.
      await tx.execute(
        `INSERT INTO earnings_allocations (transaction_id, beneficiary_user_id, share, amount_pence, reason)
         SELECT t.id, hp.user_id, 'host', $2, $3
         FROM transactions t
         JOIN bookings b          ON b.id = t.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN host_profiles hp    ON hp.id = cl.host_profile_id
         WHERE t.id = $1
         ON CONFLICT (transaction_id, beneficiary_user_id, share, reason) DO NOTHING`,
        [transactionId, amountPence, `damage:${shortfallId.slice(0, 8)}:${Number(updated.rows[0]['collected_pence'])}`],
      )
      return
    }
    await tx.execute(
      `UPDATE transactions
       SET total_charged_cents = COALESCE(total_charged_cents, 0) + $2,
           shortfall_cents = GREATEST(COALESCE(shortfall_cents, 0) - $2, 0), updated_at = NOW()
       WHERE id = $1`,
      [transactionId, amountPence],
    )
  },

  async _recordAttempt(shortfallId: string, userId: string, previousAttempts: number, owedPence: number, error: string, kind: ShortfallKind = 'session') {
    const db = await getDb()
    await db.execute(
      `UPDATE payment_shortfalls
       SET attempts = attempts + 1, last_error = $2, last_attempt_at = NOW()
       WHERE id = $1`,
      [shortfallId, error.slice(0, 500)],
    )
    if (previousAttempts > 0) return // notify once, on the first failed attempt
    const { NotificationService } = await import('@/domains/notifications/NotificationService')
    await NotificationService.send({
      userId,
      category: 'payment_issue',
      title: kind === 'damage' ? 'Damage charge outstanding' : 'Outstanding balance on your last charge',
      body: kind === 'damage'
        ? `We couldn't collect the ${fmt(owedPence)} damage charge (${error}). Top up your wallet or update your card to keep booking — it's collected automatically.`
        : `Your last session cost ${fmt(owedPence)} more than was held, and we couldn't collect it (${error}). Top up your wallet or update your card to keep booking — it's collected automatically.`,
      actionUrl: '/wallet',
      channels: ['in_app', 'email'],
    }).catch((e: unknown) => console.error('[ShortfallService.notify]', e))
  },
}
