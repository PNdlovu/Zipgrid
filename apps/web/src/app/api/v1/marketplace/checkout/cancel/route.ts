/**
 * @file route.ts
 * @description POST /api/v1/marketplace/checkout/cancel
 * Cancels a marketplace order and releases the Stripe escrow hold.
 * Callable by the buyer or an admin.
 *
 * @module apps/web/api/v1/marketplace/checkout/cancel
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors/AppError'

const BodySchema = z.object({
  orderId: z.string().uuid(),
  reason:  z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const roles  = (request.headers.get('x-user-roles') ?? '').split(',')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof BodySchema>
  try { body = BodySchema.parse(await request.json()) }
  catch { return apiError('VALIDATION_ERROR', 'orderId is required', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const { StripeService } = await import('@/domains/payments/StripeService')
    const db = await getDb()

    const orderRes = await db.execute(
      `SELECT id, status, buyer_user_id, stripe_payment_intent_id
       FROM orders WHERE id = $1 LIMIT 1`,
      [body.orderId],
    )
    if (orderRes.rows.length === 0) throw new NotFoundError('Order', body.orderId)
    const order = orderRes.rows[0] as {
      id: string; status: string; buyer_user_id: string; stripe_payment_intent_id: string
    }

    const isAdmin = roles.includes('admin')
    const isBuyer = order.buyer_user_id === userId
    if (!isAdmin && !isBuyer) throw new ForbiddenError('Only the buyer or an admin can cancel this order')

    if (!['hold_placed', 'pending'].includes(order.status)) {
      throw new ValidationError(`Cannot cancel an order with status: ${order.status}`, 'INVALID_ORDER_STATUS')
    }

    // Release the Stripe hold
    await StripeService.cancelPaymentIntent(order.stripe_payment_intent_id)

    await db.execute(
      `UPDATE orders SET status = 'cancelled', cancel_reason = $2, cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [body.orderId, body.reason ?? null],
    )

    return apiResponse({ orderId: body.orderId, status: 'cancelled' })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[checkout/cancel]', err)
    return apiError('INTERNAL_ERROR', 'Cancellation failed', 500)
  }
}
