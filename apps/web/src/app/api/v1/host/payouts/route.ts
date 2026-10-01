/**
 * @file route.ts
 * @description GET /api/v1/host/payouts — payout history for the authenticated host.
 *
 * Wraps PayoutService.getPayoutHistory() to return paginated payout batches
 * for the host earnings page. Only returns batches for the requesting user.
 *
 * @module apps/web/api/v1/host/payouts
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { PayoutService } from '@/domains/payments/PayoutService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * GET /api/v1/host/payouts
 * Returns paginated payout batches for the authenticated host.
 *
 * Query params:
 *   page     — 1-based page (default 1)
 *   pageSize — max 50 (default 20)
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  try {
    const { batches, total } = await PayoutService.getPayoutHistory(userId, page, pageSize)

    // Serialise Date fields to ISO strings for JSON response
    const serialised = batches.map((b) => ({
      id:                  b.id,
      periodStart:         b.periodStart instanceof Date ? b.periodStart.toISOString() : b.periodStart,
      periodEnd:           b.periodEnd instanceof Date ? b.periodEnd.toISOString() : b.periodEnd,
      completedSessions:   b.completedSessions,
      grossEarningsPence:  b.grossEarningsPence,
      platformFeePence:    b.platformFeePence,
      netEarningsPence:    b.netEarningsPence,
      status:              b.status,
      stripeTransferId:    b.stripeTransferId,
      failureReason:       b.failureReason,
      processedAt:         b.processedAt instanceof Date ? b.processedAt.toISOString() : b.processedAt,
      createdAt:           b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
    }))

    return apiResponse({ batches: serialised, total }, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/host/payouts]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
