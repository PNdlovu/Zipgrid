/**
 * @file route.ts
 * @description PATCH /api/v1/wallet/autotopup — configure auto top-up settings.
 * @module apps/web/api/v1/wallet/autotopup
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { WalletService } from '@/domains/payments/WalletService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const AutoTopupSchema = z.object({
  enabled: z.boolean(),
  thresholdPence: z.number().int().min(100).max(10000).optional(),
  amountPence: z.number().int().min(500).max(50000).optional(),
})

export async function PATCH(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
  const parsed = AutoTopupSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)
  try {
    await WalletService.setAutoTopup(
      userId,
      parsed.data.enabled,
      parsed.data.thresholdPence ?? 500,
      parsed.data.amountPence ?? 2000,
    )
    return apiResponse({ updated: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
