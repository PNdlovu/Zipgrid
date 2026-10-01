/**
 * @file route.ts
 * @description POST /api/v1/payments/setup-intent
 * Creates a Stripe SetupIntent so the frontend can collect and save
 * a new payment method (card) using Stripe Elements.
 *
 * The client_secret is returned for use with stripe.confirmSetup().
 * After confirmation, the pm_xxx is saved to the customer and can
 * be used for future PaymentIntent holds.
 *
 * @module apps/web/api/v1/payments/setup-intent
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { StripeService } from '@/domains/payments/StripeService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * POST /api/v1/payments/setup-intent
 * Returns { setupIntentId, clientSecret } for Stripe Elements.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Fetch or create Stripe customer
    const userResult = await db.execute(
      `SELECT email, full_name, stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (userResult.rows.length === 0) return apiError('NOT_FOUND', 'User not found', 404)

    const user = userResult.rows[0] as {
      email: string
      full_name: string
      stripe_customer_id: string | null
    }

    let customerId = user.stripe_customer_id
    if (!customerId) {
      customerId = await StripeService.createCustomer(user.email, user.full_name)
      await db.execute(
        `UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
        [customerId, userId],
      )
    }

    const result = await StripeService.createSetupIntent(customerId)
    return apiResponse(result, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/payments/setup-intent]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
