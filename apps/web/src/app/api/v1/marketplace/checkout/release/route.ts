/**
 * @file route.ts
 * @description POST /api/v1/marketplace/checkout/release
 * Captures the Stripe PaymentIntent escrow after installer confirms job completion.
 * Only callable by the authenticated vendor/installer OR an admin.
 *
 * @module apps/web/api/v1/marketplace/checkout/release
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors/AppError'

const BodySchema = z.object({
  orderId: z.string().uuid(),
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

    // Fetch the order
    const orderRes = await db.execute(
      `SELECT o.id, o.status, o.total_pence, o.stripe_payment_intent_id,
              o.installer_job_id, ij.installer_id,
              ip.user_id AS installer_user_id
       FROM orders o
       LEFT JOIN installer_jobs ij ON ij.id = o.installer_job_id
       LEFT JOIN installer_profiles ip ON ip.id = ij.installer_id
       WHERE o.id = $1 LIMIT 1`,
      [body.orderId],
    )
    if (orderRes.rows.length === 0) throw new NotFoundError('Order', body.orderId)
    const order = orderRes.rows[0] as {
      id: string; status: string; total_pence: number
      stripe_payment_intent_id: string
      installer_user_id: string | null
    }

    // Only the installer or an admin can release
    const isAdmin     = roles.includes('admin')
    const isInstaller = order.installer_user_id === userId
    if (!isAdmin && !isInstaller) {
      throw new ForbiddenError('Only the assigned installer or an admin can release payment')
    }

    if (order.status !== 'hold_placed') {
      throw new ValidationError(`Order is already ${order.status}`, 'INVALID_ORDER_STATUS')
    }

    // Capture the hold
    await StripeService.capturePaymentIntent({
      paymentIntentId: order.stripe_payment_intent_id,
      finalAmountPence: order.total_pence,
    })

    await db.execute(
      `UPDATE orders SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [body.orderId],
    )

    return apiResponse({ orderId: body.orderId, status: 'completed' })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[checkout/release]', err)
    return apiError('INTERNAL_ERROR', 'Release failed', 500)
  }
}
