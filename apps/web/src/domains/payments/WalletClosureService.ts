/**
 * @file WalletClosureService.ts
 * @description Empties a wallet when its account is deleted.
 *
 * Policy:
 *   - Money the driver paid in (Stripe top-ups) is refunded to the card it came
 *     from, newest top-up first, up to the wallet balance.
 *   - Whatever remains is non-cash credit (promotional, reward redemptions) and
 *     is forfeited with an 'adjustment' ledger row.
 *   - A wallet with funds reserved for open bookings, or an account with an
 *     unpaid session shortfall, cannot be closed.
 *
 * Each refund carries an idempotency key derived from the top-up and amount,
 * so re-running after a partial failure never refunds twice.
 *
 * @module domains/payments
 */

import { ValidationError } from '@/lib/errors/AppError'
import { StripeService } from '@/domains/payments/StripeService'
import { WalletService } from '@/domains/payments/WalletService'
import { ShortfallService } from '@/domains/payments/ShortfallService'

export const WalletClosureService = {
  /**
   * Checks the wallet can be closed.
   * @throws {ValidationError} when the wallet has reservations or the user owes money
   */
  async assertClosable(userId: string): Promise<void> {
    const b = await WalletService.getBalance(userId)
    if (b.pendingPence > 0) {
      throw new ValidationError('Your wallet has funds reserved for upcoming bookings. Cancel or complete them first.')
    }
    const owed = await ShortfallService.outstandingPence(userId)
    if (owed > 0) {
      throw new ValidationError(
        `You have an outstanding balance of £${(owed / 100).toFixed(2)}. Please clear it before closing your account.`,
      )
    }
  },

  /** Refunds top-up cash to cards and forfeits the rest. Returns what happened. */
  async close(userId: string): Promise<{ refundedPence: number; forfeitedPence: number }> {
    await this.assertClosable(userId)
    let toRefund = (await WalletService.getBalance(userId)).balancePence
    let refundedPence = 0

    for (const topUp of await WalletService.refundableTopUps(userId)) {
      if (toRefund <= 0) break
      const amount = Math.min(toRefund, topUp.refundablePence)
      await StripeService.refund({
        paymentIntentId: topUp.stripePiId,
        amountPence: amount,
        idempotencyKey: `wallet-close-${topUp.stripePiId}-${amount}`,
      })
      await WalletService.recordWithdrawal(userId, amount, topUp.stripePiId, 'Balance refunded to card on account closure')
      toRefund -= amount
      refundedPence += amount
    }

    const forfeitedPence = await WalletService.forfeitRemaining(
      userId,
      'Non-refundable credit (promotional/rewards) removed on account closure',
    )
    return { refundedPence, forfeitedPence }
  },
}
