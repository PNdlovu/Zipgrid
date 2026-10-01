/**
 * @file route.ts
 * @description GET  /api/v1/payments/methods — list saved payment methods.
 *              DELETE /api/v1/payments/methods?pmId=pm_xxx — remove a saved card.
 *
 * @module apps/web/api/v1/payments/methods
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { StripeService } from '@/domains/payments/StripeService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * GET /api/v1/payments/methods
 * Returns all saved cards for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const result = await db.execute(
      `SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    const customerId = (result.rows[0] as { stripe_customer_id: string | null } | undefined)
      ?.stripe_customer_id

    if (!customerId) {
      // User has no Stripe customer yet — return empty list
      return apiResponse([])
    }

    const methods = await StripeService.listPaymentMethods(customerId)
    return apiResponse(methods)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/payments/methods]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/**
 * DELETE /api/v1/payments/methods?pmId=pm_xxx
 * Detaches a saved payment method from the customer.
 */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const pmId = request.nextUrl.searchParams.get('pmId')
  if (!pmId) return apiError('VALIDATION_ERROR', 'pmId query param is required', 422)

  try {
    // Verify the PM belongs to this user before detaching
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const result = await db.execute(
      `SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    const customerId = (result.rows[0] as { stripe_customer_id: string | null } | undefined)
      ?.stripe_customer_id

    if (!customerId) return apiError('NOT_FOUND', 'No payment methods found', 404)

    // List methods and confirm pmId belongs to this customer
    const methods = await StripeService.listPaymentMethods(customerId)
    const owned = methods.some((m) => m.id === pmId)
    if (!owned) return apiError('FORBIDDEN', 'Payment method not found on your account', 403)

    await StripeService.detachPaymentMethod(pmId)
    return apiResponse({ detached: true, pmId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[DELETE /api/v1/payments/methods]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
