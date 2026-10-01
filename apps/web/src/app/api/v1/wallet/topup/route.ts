/**
 * @file route.ts
 * @description POST /api/v1/wallet/topup — create a Stripe PaymentIntent for wallet top-up.
 * The client confirms the PI using Stripe.js, then the webhook credits the wallet.
 * @module apps/web/api/v1/wallet/topup
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { StripeService } from '@/domains/payments/StripeService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const TopupSchema = z.object({
  amountPence: z.number().int().min(500, 'Minimum top-up is £5').max(50000, 'Maximum top-up is £500'),
  paymentMethodId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = TopupSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Ensure Stripe customer exists
    const userRes = await db.execute(
      `SELECT email, full_name, stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (userRes.rows.length === 0) return apiError('NOT_FOUND', 'User not found', 404)

    const user = userRes.rows[0] as { email: string; full_name: string; stripe_customer_id: string | null }
    let customerId = user.stripe_customer_id
    if (!customerId) {
      customerId = await StripeService.createCustomer(user.email, user.full_name)
      await db.execute(`UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`, [customerId, userId])
    }

    // Create a capture PaymentIntent (immediate capture — wallet top-up, not a hold)
    const intent = await StripeService.createPaymentIntentHold({
      amountPence: parsed.data.amountPence,
      stripeCustomerId: customerId,
      paymentMethodId: parsed.data.paymentMethodId,
      bookingId: `wallet-topup-${userId}`,
      description: `Zipgrid wallet top-up £${(parsed.data.amountPence / 100).toFixed(2)}`,
    })

    return apiResponse({
      paymentIntentId: intent.paymentIntentId,
      clientSecret: intent.clientSecret,
      amountPence: parsed.data.amountPence,
    }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/wallet/topup]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
