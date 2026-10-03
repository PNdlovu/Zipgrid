/**
 * @file route.ts
 * @description POST /api/v1/rewards/redeem — redeem points as wallet credit.
 * @module apps/web/api/v1/rewards/redeem
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { RewardsService } from '@/domains/rewards/RewardsService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const RedeemSchema = z.object({
  points: z.number().int().min(500).multipleOf(100),
})

/** POST /api/v1/rewards/redeem — redeem points as wallet credit. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
  const parsed = RedeemSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)
  try {
    const result = await RewardsService.redeem(userId, parsed.data.points)
    return apiResponse({ ...result, pointsRedeemed: parsed.data.points })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
