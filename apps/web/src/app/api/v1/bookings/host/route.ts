/**
 * @file route.ts
 * @description GET /api/v1/bookings/host — paginated bookings for the host's listings.
 *              PATCH /api/v1/bookings/host — approve or reject a pending booking.
 *
 * Hosts who have `instant_book_enabled = false` on a listing must manually
 * approve or reject each `pending` booking within 24 hours.
 *
 * Query params (GET):
 *   status   — filter by booking status (default: all)
 *   listingId — filter to a single listing (optional)
 *   page     — 1-based page (default 1)
 *   pageSize — max 100 (default 20)
 *
 * @module apps/web/api/v1/bookings/host
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { BookingService } from '@/domains/booking/BookingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/* ── GET — host booking list ────────────────────────────────── */

/**
 * GET /api/v1/bookings/host
 * Returns a paginated list of bookings for the authenticated host's listings.
 * Supports optional ?status and ?listingId filters.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const status    = searchParams.get('status') ?? undefined
  const listingId = searchParams.get('listingId') ?? undefined
  const page      = Math.max(1, parseInt(searchParams.get('page')     ?? '1',  10))
  const pageSize  = Math.min(100, parseInt(searchParams.get('pageSize') ?? '20', 10))

  try {
    const { bookings, total } = await BookingService.listByHost(userId, {
      ...(status    !== undefined ? { status }    : {}),
      ...(listingId !== undefined ? { listingId } : {}),
      page,
      pageSize,
    })

    return apiResponse(bookings, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/bookings/host]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/* ── PATCH — approve or reject a pending booking ────────────── */

const ApproveRejectSchema = z.object({
  bookingId: z.string().uuid(),
  action:    z.enum(['approve', 'reject']),
  reason:    z.string().max(500).optional(),
})

/**
 * PATCH /api/v1/bookings/host
 * Approves or rejects a pending booking on one of the host's listings.
 * Body: { bookingId, action: 'approve' | 'reject', reason? }
 * On approve: sets status to confirmed, notifies driver.
 * On reject:  sets status to cancelled_by_host, releases Stripe hold.
 */
export async function PATCH(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = ApproveRejectSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const { bookingId, action, reason } = parsed.data

  try {
    if (action === 'approve') {
      await BookingService.approve(bookingId, userId)
    } else {
      await BookingService.cancel(bookingId, userId, reason ?? 'Booking declined by host')
    }
    return apiResponse({ bookingId, action, updated: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[PATCH /api/v1/bookings/host]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
