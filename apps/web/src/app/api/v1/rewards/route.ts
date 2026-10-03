/**
 * @file route.ts
 * @description GET /api/v1/rewards — points balance, tier info, wallet equivalent.
 * @module apps/web/api/v1/rewards
 */

import { type NextRequest } from 'next/server'
import { RewardsService } from '@/domains/rewards/RewardsService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/rewards — points balance, tier info, wallet equivalent. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  try {
    const [balance, badges] = await Promise.all([
      RewardsService.getBalance(userId),
      RewardsService.getBadges(userId),
    ])
    return apiResponse({ balance, badges })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
