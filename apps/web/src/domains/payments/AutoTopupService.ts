/**
 * @file AutoTopupService.ts
 * @description Automatic wallet top-ups from the driver's default card.
 *
 * Triggers:
 *   - low_balance: after a wallet debit leaves the available balance below the
 *     driver's threshold, top up by their configured amount.
 *   - booking: a wallet booking needs more than is available — top up by the
 *     configured amount, or the gap rounded up to the next pound if larger, so
 *     the booking goes through instead of failing.
 *
 * Safeguards:
 *   - one attempt in flight per user (uq_wallet_auto_topups_pending)
 *   - at most MAX_AUTO_TOPUPS_PER_DAY successful top-ups per rolling 24 hours
 *   - charges are off-session with an idempotency key per attempt
 *   - a decline, or a bank demanding authentication, notifies the driver;
 *     MAX_CONSECUTIVE_FAILURES in a row switches auto top-up off
 *   - Stripe outages are not the driver's fault and don't count as failures
 *
 * Successful charges are credited immediately; the payment_intent.succeeded
 * webhook credits the same PaymentIntent idempotently as a backstop.
 *
 * @module domains/payments
 */

import { getDb } from '@/lib/db'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { MAX_TOPUP_PENCE, MIN_TOPUP_PENCE, WalletService } from '@/domains/payments/WalletService'
import { ShortfallService } from '@/domains/payments/ShortfallService'

export const MAX_AUTO_TOPUPS_PER_DAY = 3
export const MAX_CONSECUTIVE_FAILURES = 2

export type AutoTopupTrigger = 'low_balance' | 'booking'
export type AutoTopupResult = 'succeeded' | 'failed' | 'skipped'

const fmt = (pence: number) => `£${(pence / 100).toFixed(2)}`

async function notify(userId: string, title: string, body: string): Promise<void> {
  const { NotificationService } = await import('@/domains/notifications/NotificationService')
  await NotificationService.send({
    userId, category: 'payment_issue', title, body, actionUrl: '/wallet', channels: ['in_app', 'email'],
  }).catch((e: unknown) => console.error('[AutoTopupService.notify]', e))
}

export const AutoTopupService = {
  /**
   * Makes sure `requiredPence` is available, topping up when auto top-up is on.
   * Returns true when the wallet now covers the amount.
   */
  async ensureAvailable(userId: string, requiredPence: number): Promise<boolean> {
    const b = await WalletService.getBalance(userId)
    if (b.availablePence >= requiredPence) return true
    if (!b.autoTopupEnabled) return false
    const gap = requiredPence - b.availablePence
    const amount = Math.min(
      MAX_TOPUP_PENCE,
      Math.max(b.autoTopupAmountPence, MIN_TOPUP_PENCE, Math.ceil(gap / 100) * 100),
    )
    if (amount < gap) return false
    return (await this.run(userId, amount, 'booking')) === 'succeeded'
  },

  /** Tops up when a debit has left the available balance below the threshold. Never throws. */
  async afterDebit(userId: string): Promise<void> {
    try {
      const b = await WalletService.getBalance(userId)
      if (!b.autoTopupEnabled || b.availablePence >= b.autoTopupThresholdPence) return
      await this.run(userId, b.autoTopupAmountPence, 'low_balance')
    } catch (err) {
      console.error('[AutoTopupService.afterDebit]', userId, err)
    }
  },

  /** Performs one guarded auto top-up attempt. */
  async run(userId: string, amountPence: number, trigger: AutoTopupTrigger): Promise<AutoTopupResult> {
    if (!StripeService.isConfigured()) return 'skipped'
    const db = await getDb()

    const recent = await db.execute(
      `SELECT COUNT(*)::INT AS n FROM wallet_auto_topups
       WHERE user_id = $1 AND status = 'succeeded' AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId],
    )
    if (Number(recent.rows[0]?.['n'] ?? 0) >= MAX_AUTO_TOPUPS_PER_DAY) return 'skipped'

    const claim = await db.execute(
      `INSERT INTO wallet_auto_topups (user_id, trigger, amount_pence) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING id`,
      [userId, trigger, amountPence],
    )
    const attemptId = claim.rows[0]?.['id'] as string | undefined
    if (!attemptId) return 'skipped' // another attempt is in flight

    const card = await StripeCustomer.defaultCard(userId)
    if (!card) {
      await this._fail(attemptId, userId, 'No saved card to charge.', true)
      return 'failed'
    }

    let charge: { paymentIntentId: string; status: string }
    try {
      charge = await StripeService.chargeOffSession({
        amountPence,
        stripeCustomerId: card.customerId,
        paymentMethodId: card.paymentMethodId,
        description: `Zipgrid wallet auto top-up ${fmt(amountPence)}`,
        metadata: { purpose: 'wallet_topup', user_id: userId, auto_topup_id: attemptId },
        idempotencyKey: `auto-topup-${attemptId}`,
      })
    } catch (err) {
      const cardError = StripeService.isCardError(err)
      await this._fail(attemptId, userId, cardError ? err.message : 'Payment provider unavailable.', cardError)
      if (!cardError) console.error('[AutoTopupService.run]', userId, err)
      return 'failed'
    }

    if (charge.status !== 'succeeded' && charge.status !== 'processing') {
      // e.g. requires_action: the bank wants the driver present. Don't leave it dangling.
      await StripeService.cancelPaymentIntent(charge.paymentIntentId, 'abandoned').catch(() => {})
      await this._fail(attemptId, userId, 'Your bank asked to confirm this payment. Please top up manually.', true, charge.paymentIntentId)
      return 'failed'
    }

    if (charge.status === 'succeeded') await WalletService.topUp(userId, amountPence, charge.paymentIntentId)
    await db.execute(
      `UPDATE wallet_auto_topups SET status = 'succeeded', stripe_pi_id = $2, completed_at = NOW() WHERE id = $1`,
      [attemptId, charge.paymentIntentId],
    )
    await db.execute(`UPDATE wallet_balances SET auto_topup_failures = 0 WHERE user_id = $1`, [userId])
    await ShortfallService.collectFromWallet(userId)
    return 'succeeded'
  },

  async _fail(
    attemptId: string,
    userId: string,
    message: string,
    countsAsFailure: boolean,
    stripePiId: string | null = null,
  ): Promise<void> {
    const db = await getDb()
    await db.execute(
      `UPDATE wallet_auto_topups
       SET status = 'failed', failure_message = $2, stripe_pi_id = COALESCE($3, stripe_pi_id), completed_at = NOW()
       WHERE id = $1`,
      [attemptId, message.slice(0, 500), stripePiId],
    )
    if (!countsAsFailure) return

    const res = await db.execute(
      `UPDATE wallet_balances
       SET auto_topup_failures = auto_topup_failures + 1,
           auto_topup_enabled = auto_topup_enabled AND auto_topup_failures + 1 < $2,
           updated_at = NOW()
       WHERE user_id = $1
       RETURNING auto_topup_enabled`,
      [userId, MAX_CONSECUTIVE_FAILURES],
    )
    const stillEnabled = Boolean(res.rows[0]?.['auto_topup_enabled'])
    await notify(
      userId,
      stillEnabled ? 'Auto top-up failed' : 'Auto top-up turned off',
      stillEnabled
        ? `We couldn't top up your wallet: ${message} Check your card in Settings → Payments.`
        : `We couldn't top up your wallet after repeated attempts (${message}), so auto top-up is now off. Update your card and switch it back on in your wallet.`,
    )
  },
}
