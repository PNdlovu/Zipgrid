/**
 * @file route.ts
 * @description Saved cards for the authenticated user.
 *   GET    /api/v1/payments/methods             — list saved cards
 *   PATCH  /api/v1/payments/methods             — { paymentMethodId } set the default card
 *   DELETE /api/v1/payments/methods?pmId=pm_xxx — remove a saved card
 * Cards are added via POST /api/v1/payments/setup-intent + Stripe Elements.
 * Every mutation first checks the card belongs to the caller's Stripe customer.
 *
 * @module apps/web/api/v1/payments/methods
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const PM_ID = /^pm_[A-Za-z0-9]+$/

/** GET /api/v1/payments/methods — list saved cards. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const customerId = await StripeCustomer.getId(userId)
    if (!customerId) return apiResponse([])
    return apiResponse(await StripeService.listPaymentMethods(customerId))
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/payments/methods')
  }
}

const SetDefaultSchema = z.object({ paymentMethodId: z.string().regex(PM_ID, 'Invalid paymentMethodId') })

/** PATCH /api/v1/payments/methods — { paymentMethodId } set the default card. */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
    const parsed = SetDefaultSchema.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)

    const { paymentMethodId } = parsed.data
    if (!(await StripeCustomer.ownsPaymentMethod(userId, paymentMethodId))) {
      return apiError('NOT_FOUND', 'Payment method not found on your account', 404)
    }
    await StripeService.setDefaultPaymentMethod((await StripeCustomer.getId(userId))!, paymentMethodId)
    return apiResponse({ defaultPaymentMethodId: paymentMethodId })
  } catch (err) {
    return errorResponse(err, 'PATCH /api/v1/payments/methods')
  }
}

/** DELETE /api/v1/payments/methods?pmId=pm_xxx — remove a saved card. */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const pmId = request.nextUrl.searchParams.get('pmId') ?? ''
    if (!PM_ID.test(pmId)) return apiError('VALIDATION_ERROR', 'pmId query param is required', 422)
    if (!(await StripeCustomer.ownsPaymentMethod(userId, pmId))) {
      return apiError('NOT_FOUND', 'Payment method not found on your account', 404)
    }
    await StripeService.detachPaymentMethod(pmId)
    return apiResponse({ detached: true, pmId })
  } catch (err) {
    return errorResponse(err, 'DELETE /api/v1/payments/methods')
  }
}
