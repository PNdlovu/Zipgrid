/**
 * @file route.ts
 * @description GET /api/v1/bookings/driver — paginated booking history for the
 * authenticated driver. Supports optional status filter and pagination.
 *
 * @module apps/web/api/v1/bookings/driver
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { BookingService } from '@/domains/booking/BookingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * GET /api/v1/bookings/driver
 *
 * Query params:
 *   status   — filter by booking status (optional)
 *   page     — 1-based page number (default 1)
 *   pageSize — items per page, max 100 (default 20)
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') ?? undefined
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  try {
    const { bookings, total } = await BookingService.listByDriver(userId, {
      ...(status !== undefined ? { status } : {}),
      page,
      pageSize,
    })

    return apiResponse(bookings, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/bookings/driver]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
