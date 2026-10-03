/**
 * @file route.ts
 * @description POST /api/v1/wallet/topup — charge a saved card to top up the wallet.
 *
 * The charge is captured immediately. A charge that succeeds synchronously is
 * credited here (then any outstanding session balance is cleared from it); the
 * payment_intent.succeeded webhook credits the same PaymentIntent idempotently,
 * which covers 3-D Secure and delayed confirmations. Response status:
 *   succeeded       — wallet already credited
 *   requires_action — client must complete 3-D Secure with clientSecret; the
 *                     webhook credits the wallet afterwards
 * The client supplies an idempotency key so a retried request never charges twice.
 *
 * @module apps/web/api/v1/wallet/topup
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { StripeService } from '@/domains/payments/StripeService'
import { MAX_TOPUP_PENCE, MIN_TOPUP_PENCE, WalletService } from '@/domains/payments/WalletService'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { ServiceUnavailableError } from '@/lib/errors/AppError'

const TopupSchema = z.object({
  amountPence: z.number().int()
    .min(MIN_TOPUP_PENCE, `Minimum top-up is £${MIN_TOPUP_PENCE / 100}`)
    .max(MAX_TOPUP_PENCE, `Maximum top-up is £${MAX_TOPUP_PENCE / 100}`),
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/, 'paymentMethodId is required'),
  idempotencyKey: z.string().uuid('idempotencyKey must be a UUID'),
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    if (!StripeService.isConfigured()) throw new ServiceUnavailableError('Payments')

    let body: unknown
    try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
    const parsed = TopupSchema.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)

    // A payment method can only be charged by the customer it is saved on.
    if (!(await StripeCustomer.ownsPaymentMethod(userId, parsed.data.paymentMethodId))) {
      return apiError('VALIDATION_ERROR', 'Payment method not found on your account. Add a card in Settings → Payments.', 422)
    }
    const customerId = (await StripeCustomer.getId(userId))!

    let intent: { paymentIntentId: string; clientSecret: string; status: string }
    try {
      intent = await StripeService.createWalletTopUp({
        amountPence: parsed.data.amountPence,
        stripeCustomerId: customerId,
        paymentMethodId: parsed.data.paymentMethodId,
        userId,
        idempotencyKey: `wallet-topup-${userId}-${parsed.data.idempotencyKey}`,
      })
    } catch (err) {
      if (StripeService.isCardError(err)) {
        return apiError('PAYMENT_FAILED', err.message, 402)
      }
      throw err
    }

    if (intent.status !== 'succeeded' && intent.status !== 'requires_action' && intent.status !== 'processing') {
      return apiError('PAYMENT_FAILED', 'Your card could not be charged. Please try another card.', 402)
    }
    if (intent.status === 'succeeded') {
      await WalletService.topUp(userId, parsed.data.amountPence, intent.paymentIntentId)
      await ShortfallService.collectFromWallet(userId)
    }

    return apiResponse({
      paymentIntentId: intent.paymentIntentId,
      status: intent.status,
      clientSecret: intent.status === 'requires_action' ? intent.clientSecret : null,
      amountPence: parsed.data.amountPence,
    }, undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/wallet/topup')
  }
}
