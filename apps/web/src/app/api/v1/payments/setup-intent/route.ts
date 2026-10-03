/**
 * @file route.ts
 * @description POST /api/v1/payments/setup-intent
 * Creates a Stripe SetupIntent (usage: off_session) so the client can save a
 * card with Stripe Elements (stripe.confirmSetup). Saved cards can then pay for
 * bookings, wallet top-ups, auto top-ups and outstanding session balances.
 * Returns { setupIntentId, clientSecret }.
 *
 * @module apps/web/api/v1/payments/setup-intent
 */

import { type NextRequest } from 'next/server'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { ServiceUnavailableError } from '@/lib/errors/AppError'

/** POST /api/v1/payments/setup-intent — Creates a Stripe SetupIntent (usage: off_session) so the client can save a card with Stripe Elements (stripe.confirmSetup). */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    if (!StripeService.isConfigured()) throw new ServiceUnavailableError('Payments')
    const customerId = await StripeCustomer.getOrCreateId(userId)
    return apiResponse(await StripeService.createSetupIntent(customerId), undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/payments/setup-intent')
  }
}
