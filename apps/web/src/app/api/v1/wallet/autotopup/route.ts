/**
 * @file route.ts
 * @description PATCH /api/v1/wallet/autotopup — configure auto top-up settings.
 * Turning it on requires a saved card (the default card is the one charged).
 * @module apps/web/api/v1/wallet/autotopup
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { WalletService } from '@/domains/payments/WalletService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const AutoTopupSchema = z.object({
  enabled: z.boolean(),
  thresholdPence: z.number().int().min(100).max(10000).optional(),
  amountPence: z.number().int().min(500).max(50000).optional(),
})

/** PATCH /api/v1/wallet/autotopup — configure auto top-up settings. */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
    const parsed = AutoTopupSchema.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)

    if (parsed.data.enabled && !(await StripeCustomer.defaultCard(userId))) {
      return apiError('NO_PAYMENT_METHOD', 'Add a card in Settings → Payments before turning on auto top-up.', 422)
    }

    await WalletService.setAutoTopup(
      userId,
      parsed.data.enabled,
      parsed.data.thresholdPence ?? 500,
      parsed.data.amountPence ?? 2000,
    )
    return apiResponse({ updated: true })
  } catch (err) {
    return errorResponse(err, 'PATCH /api/v1/wallet/autotopup')
  }
}
