/**
 * @file StripeCustomer.ts
 * @description Maps Zipgrid users to their Stripe Customer (users.stripe_customer_id).
 * The single place that looks up, lazily creates, and checks card ownership.
 *
 * @module domains/payments
 */

import { getDb } from '@/lib/db'
import { NotFoundError } from '@/lib/errors/AppError'
import { StripeService } from '@/domains/payments/StripeService'

export const StripeCustomer = {
  /** The user's Stripe customer id, or null if they have never saved a card or paid. */
  async getId(userId: string): Promise<string | null> {
    const db = await getDb()
    const res = await db.execute(`SELECT stripe_customer_id FROM users WHERE id = $1`, [userId])
    return (res.rows[0]?.['stripe_customer_id'] as string | null | undefined) ?? null
  },

  /** The user's Stripe customer id, creating the customer on first use. */
  async getOrCreateId(userId: string): Promise<string> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT email, full_name, stripe_customer_id FROM users WHERE id = $1`,
      [userId],
    )
    const u = res.rows[0]
    if (!u) throw new NotFoundError('User', userId)
    if (u['stripe_customer_id']) return u['stripe_customer_id'] as string

    const created = await StripeService.createCustomer(u['email'] as string, u['full_name'] as string)
    // A concurrent request may have created one first; keep whichever landed.
    const upd = await db.execute(
      `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2), updated_at = NOW()
       WHERE id = $1 RETURNING stripe_customer_id`,
      [userId, created],
    )
    return upd.rows[0]!['stripe_customer_id'] as string
  },

  /** The user's default card (else most recent), with its customer; null when none. */
  async defaultCard(userId: string): Promise<{ customerId: string; paymentMethodId: string } | null> {
    const customerId = await this.getId(userId)
    if (!customerId) return null
    const paymentMethodId = await StripeService.getDefaultPaymentMethodId(customerId)
    return paymentMethodId ? { customerId, paymentMethodId } : null
  },

  /** True when the card is saved on this user's Stripe customer. */
  async ownsPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    const customerId = await this.getId(userId)
    if (!customerId) return false
    const methods = await StripeService.listPaymentMethods(customerId)
    return methods.some((m) => m.id === paymentMethodId)
  },
}
