/**
 * @file route.ts
 * @description GET /api/v1/bookings/[id]  — booking detail.
 *              PATCH /api/v1/bookings/[id] — cancel a booking.
 *
 * @module apps/web/api/v1/bookings/[id]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { BookingService } from '@/domains/booking/BookingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const CancelSchema = z.object({
  action: z.literal('cancel'),
  reason: z.string().max(500).optional(),
})

/**
 * GET /api/v1/bookings/[id]
 * Returns booking detail. Access instructions only returned for confirmed/active bookings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params

  try {
    const booking = await BookingService.getById(id, userId)
    return apiResponse(booking)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/bookings/:id]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/**
 * PATCH /api/v1/bookings/[id]
 * Accepts { action: 'cancel', reason?: string }.
 * Cancels the booking and releases the Stripe PaymentIntent hold.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = CancelSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const { cancelledBy } = await BookingService.cancel(id, userId, parsed.data.reason)
    return apiResponse({ cancelled: true, bookingId: id, cancelledBy })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[PATCH /api/v1/bookings/:id]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/**
 * DELETE /api/v1/bookings/[id]
 * Cancels the booking (same as PATCH { action: 'cancel' }) and releases the hold.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const { id } = await params
  try {
    const { cancelledBy } = await BookingService.cancel(id, userId)
    return apiResponse({ cancelled: true, bookingId: id, cancelledBy })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[DELETE /api/v1/bookings/:id]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
