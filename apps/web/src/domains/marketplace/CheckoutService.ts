/**
 * @file CheckoutService.ts
 * @description Marketplace escrow payments (Stripe manual capture).
 *
 *   Product order:  checkout → order 'payment_authorised' (hold)
 *                   release  → capture, 'confirmed'      (vendor or admin)
 *                   cancel   → release hold, 'cancelled' (buyer or admin)
 *
 *   Installer job:  checkout → hold stored on installer_jobs (job's client only)
 *                   release  → capture, job 'completed'  (installer or admin)
 *                   cancel   → release hold, job 'cancelled' (client or admin)
 *
 * Holds expire after ~7 days, so releases must happen within that window.
 * All Stripe calls carry idempotency keys; row locks prevent double capture.
 *
 * @module domains/marketplace
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, transaction } from '@/lib/db'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/AppError'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'

export type CheckoutTarget =
  | { kind: 'product'; productId: string; quantity: number; shippingAddress?: Record<string, unknown> }
  | { kind: 'installer_job'; installerJobId: string }

export type CheckoutResult = {
  kind: CheckoutTarget['kind']
  id: string
  paymentIntentId: string
  amountPence: number
  status: string
}

async function placeHold(input: {
  userId: string
  amountPence: number
  paymentMethodId: string
  reference: string
  description: string
}): Promise<string> {
  const customer = await StripeCustomer.getOrCreateId(input.userId)
  const hold = await StripeService.createPaymentIntentHold({
    amountPence: input.amountPence,
    stripeCustomerId: customer,
    paymentMethodId: input.paymentMethodId,
    bookingId: input.reference,
    description: input.description,
    idempotencyKey: `marketplace-hold-${input.reference}`,
  })
  if (hold.status !== 'requires_capture') {
    await StripeService.cancelPaymentIntent(hold.paymentIntentId, 'abandoned').catch(() => {})
    throw new AppError('Card authorisation failed. Please check your payment method.', 'PAYMENT_FAILED', 402)
  }
  return hold.paymentIntentId
}

export const CheckoutService = {
  async checkout(userId: string, target: CheckoutTarget, paymentMethodId: string): Promise<CheckoutResult> {
    const db = await getDb()

    if (target.kind === 'product') {
      const res = await db.execute(
        `SELECT p.id, p.name, p.price_pence, p.status, p.stock_qty, p.track_inventory,
                p.commission_rate_pct, p.vendor_profile_id, vp.user_id AS vendor_user_id
         FROM products p JOIN vendor_profiles vp ON vp.id = p.vendor_profile_id
         WHERE p.id = $1`,
        [target.productId],
      )
      const p = res.rows[0]
      if (!p || p['status'] !== 'active') throw new NotFoundError('Product', target.productId)
      if (p['vendor_user_id'] === userId) throw new ValidationError('You cannot buy your own product.')
      if (p['track_inventory'] && Number(p['stock_qty']) < target.quantity) {
        throw new ConflictError('Not enough stock for this quantity.', 'OUT_OF_STOCK')
      }

      const unit = Number(p['price_pence'])
      const total = unit * target.quantity
      const commission = Math.round(total * Number(p['commission_rate_pct'] ?? 10) / 100)
      const orderId = uuidv4()
      const paymentIntentId = await placeHold({
        userId, amountPence: total, paymentMethodId, reference: orderId,
        description: `${p['name'] as string} × ${target.quantity}`,
      })

      try {
        await transaction(async (tx) => {
          if (p['track_inventory']) {
            const stock = await tx.execute(
              `UPDATE products SET stock_qty = stock_qty - $2, updated_at = NOW()
               WHERE id = $1 AND stock_qty >= $2 RETURNING id`,
              [target.productId, target.quantity],
            )
            if (stock.rows.length === 0) throw new ConflictError('Not enough stock for this quantity.', 'OUT_OF_STOCK')
          }
          await tx.execute(
            `INSERT INTO orders (id, buyer_user_id, status, stripe_payment_intent_id,
                                 subtotal_pence, total_pence, platform_fee_pence, shipping_address)
             VALUES ($1, $2, 'payment_authorised', $3, $4, $4, $5, $6::jsonb)`,
            [orderId, userId, paymentIntentId, total, commission, JSON.stringify(target.shippingAddress ?? {})],
          )
          await tx.execute(
            `INSERT INTO order_line_items (order_id, product_id, vendor_id, quantity, unit_price_pence,
                                           total_price_pence, commission_pence, vendor_net_pence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [orderId, target.productId, p['vendor_profile_id'], target.quantity, unit, total, commission, total - commission],
          )
        })
      } catch (err) {
        await StripeService.cancelPaymentIntent(paymentIntentId, 'abandoned').catch(() => {})
        throw err
      }
      return { kind: 'product', id: orderId, paymentIntentId, amountPence: total, status: 'payment_authorised' }
    }

    // Installer job
    const res = await db.execute(
      `SELECT id, title, client_user_id, status, quoted_price_pence, stripe_payment_intent_id
       FROM installer_jobs WHERE id = $1`,
      [target.installerJobId],
    )
    const job = res.rows[0]
    if (!job) throw new NotFoundError('Installer job', target.installerJobId)
    if (job['client_user_id'] !== userId) throw new ForbiddenError('Only the client on this job can pay for it.')
    if (!['pending', 'confirmed'].includes(job['status'] as string)) {
      throw new ConflictError(`Job is ${job['status'] as string}.`, 'INVALID_JOB_STATUS')
    }
    if (job['stripe_payment_intent_id']) throw new ConflictError('This job has already been paid for.', 'ALREADY_PAID')
    const amount = Number(job['quoted_price_pence'] ?? 0)
    if (amount < 50) throw new ValidationError('The installer has not provided a quote yet.', 'NO_QUOTE')

    const paymentIntentId = await placeHold({
      userId, amountPence: amount, paymentMethodId, reference: target.installerJobId,
      description: job['title'] as string,
    })
    const updated = await db.execute(
      `UPDATE installer_jobs SET stripe_payment_intent_id = $2, updated_at = NOW()
       WHERE id = $1 AND stripe_payment_intent_id IS NULL RETURNING id`,
      [target.installerJobId, paymentIntentId],
    )
    if (updated.rows.length === 0) {
      await StripeService.cancelPaymentIntent(paymentIntentId, 'duplicate').catch(() => {})
      throw new ConflictError('This job has already been paid for.', 'ALREADY_PAID')
    }
    return { kind: 'installer_job', id: target.installerJobId, paymentIntentId, amountPence: amount, status: 'payment_authorised' }
  },

  /** Captures the escrow. Product: vendor or admin. Installer job: installer or admin. */
  async release(input: { kind: CheckoutTarget['kind']; id: string; userId: string; isAdmin: boolean }): Promise<void> {
    await transaction(async (tx) => {
      if (input.kind === 'product') {
        await tx.execute(`SELECT 1 FROM orders WHERE id = $1 FOR UPDATE`, [input.id])
        const res = await tx.execute(
          `SELECT o.status, o.total_pence, o.stripe_payment_intent_id,
                  bool_or(vp.user_id = $2) AS is_vendor
           FROM orders o
           JOIN order_line_items li ON li.order_id = o.id
           JOIN vendor_profiles vp  ON vp.id = li.vendor_id
           WHERE o.id = $1
           GROUP BY o.id`,
          [input.id, input.userId],
        )
        const o = res.rows[0]
        if (!o) throw new NotFoundError('Order', input.id)
        if (!input.isAdmin && !o['is_vendor']) throw new ForbiddenError('Only the vendor or an admin can release payment')
        if (o['status'] !== 'payment_authorised') {
          throw new ConflictError(`Order is already ${o['status'] as string}.`, 'INVALID_ORDER_STATUS')
        }
        await StripeService.capturePaymentIntent({
          paymentIntentId: o['stripe_payment_intent_id'] as string,
          finalAmountPence: Number(o['total_pence']),
          idempotencyKey: `marketplace-capture-${input.id}`,
        })
        await tx.execute(`UPDATE orders SET status = 'confirmed', updated_at = NOW() WHERE id = $1`, [input.id])
        return
      }

      const res = await tx.execute(
        `SELECT ij.status, ij.quoted_price_pence, ij.stripe_payment_intent_id, ij.commission_rate_pct,
                ip.user_id AS installer_user_id
         FROM installer_jobs ij JOIN installer_profiles ip ON ip.id = ij.installer_profile_id
         WHERE ij.id = $1 FOR UPDATE OF ij`,
        [input.id],
      )
      const j = res.rows[0]
      if (!j) throw new NotFoundError('Installer job', input.id)
      if (!input.isAdmin && j['installer_user_id'] !== input.userId) {
        throw new ForbiddenError('Only the assigned installer or an admin can release payment')
      }
      if (!j['stripe_payment_intent_id']) throw new ValidationError('This job has not been paid for.', 'NOT_PAID')
      if (['completed', 'cancelled'].includes(j['status'] as string)) {
        throw new ConflictError(`Job is already ${j['status'] as string}.`, 'INVALID_JOB_STATUS')
      }
      const amount = Number(j['quoted_price_pence'])
      await StripeService.capturePaymentIntent({
        paymentIntentId: j['stripe_payment_intent_id'] as string,
        finalAmountPence: amount,
        idempotencyKey: `marketplace-capture-${input.id}`,
      })
      const fee = Math.round(amount * Number(j['commission_rate_pct'] ?? 12) / 100)
      await tx.execute(
        `UPDATE installer_jobs
         SET status = 'completed', final_price_pence = $2, platform_fee_pence = $3,
             installer_net_pence = $2::int - $3::int, installer_completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [input.id, amount, fee],
      )
    })
  },

  /** Releases the hold. Product: buyer or admin. Installer job: client or admin. */
  async cancel(input: { kind: CheckoutTarget['kind']; id: string; userId: string; isAdmin: boolean; reason?: string }): Promise<void> {
    await transaction(async (tx) => {
      if (input.kind === 'product') {
        const res = await tx.execute(
          `SELECT status, buyer_user_id, stripe_payment_intent_id FROM orders WHERE id = $1 FOR UPDATE`,
          [input.id],
        )
        const o = res.rows[0]
        if (!o) throw new NotFoundError('Order', input.id)
        if (!input.isAdmin && o['buyer_user_id'] !== input.userId) {
          throw new ForbiddenError('Only the buyer or an admin can cancel this order')
        }
        if (!['pending', 'payment_authorised'].includes(o['status'] as string)) {
          throw new ConflictError(`Cannot cancel an order that is ${o['status'] as string}.`, 'INVALID_ORDER_STATUS')
        }
        if (o['stripe_payment_intent_id']) {
          await StripeService.cancelPaymentIntent(o['stripe_payment_intent_id'] as string)
        }
        await tx.execute(
          `UPDATE orders SET status = 'cancelled', cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [input.id, input.reason ?? null],
        )
        // Return stock
        await tx.execute(
          `UPDATE products p SET stock_qty = p.stock_qty + li.quantity, updated_at = NOW()
           FROM order_line_items li
           WHERE li.order_id = $1 AND li.product_id = p.id AND p.track_inventory`,
          [input.id],
        )
        return
      }

      const res = await tx.execute(
        `SELECT status, client_user_id, stripe_payment_intent_id FROM installer_jobs WHERE id = $1 FOR UPDATE`,
        [input.id],
      )
      const j = res.rows[0]
      if (!j) throw new NotFoundError('Installer job', input.id)
      if (!input.isAdmin && j['client_user_id'] !== input.userId) {
        throw new ForbiddenError('Only the client or an admin can cancel this job')
      }
      if (['completed', 'cancelled'].includes(j['status'] as string)) {
        throw new ConflictError(`Job is already ${j['status'] as string}.`, 'INVALID_JOB_STATUS')
      }
      if (j['stripe_payment_intent_id']) {
        await StripeService.cancelPaymentIntent(j['stripe_payment_intent_id'] as string)
      }
      await tx.execute(
        `UPDATE installer_jobs SET status = 'cancelled', cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [input.id, input.reason ?? null],
      )
    })
  },
}
