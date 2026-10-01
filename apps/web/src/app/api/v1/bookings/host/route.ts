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
import { AppError, ForbiddenError, NotFoundError } from '@/lib/errors/AppError'

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
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify host owns the listing for this booking
    const bookingRes = await db.execute(
      `SELECT b.id, b.status, b.driver_profile_id,
              cl.id AS listing_id,
              hp.user_id AS host_user_id
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId],
    )

    if (bookingRes.rows.length === 0) throw new NotFoundError('Booking', bookingId)

    const booking = bookingRes.rows[0] as {
      id: string
      status: string
      driver_profile_id: string
      listing_id: string
      host_user_id: string
    }

    if (booking.host_user_id !== userId) throw new ForbiddenError()

    if (booking.status !== 'pending') {
      return apiError(
        'INVALID_STATE',
        `Booking is already '${booking.status}' — only pending bookings can be approved or rejected.`,
        409,
      )
    }

    if (action === 'approve') {
      await db.execute(
        `UPDATE bookings
         SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [bookingId],
      )

      // Notify the driver
      try {
        const { NotificationService } = await import('@/domains/notifications/NotificationService')
        const driverRes = await db.execute(
          `SELECT dp.user_id FROM driver_profiles dp WHERE dp.id = $1 LIMIT 1`,
          [booking.driver_profile_id],
        )
        if (driverRes.rows.length > 0) {
          await NotificationService.send({
            userId: (driverRes.rows[0] as { user_id: string }).user_id,
            category: 'booking_confirmed',
            title: 'Booking approved',
            body: 'Your booking has been approved by the host. You\'re all set!',
            actionUrl: `/driver/bookings/${bookingId}`,
            channels: ['in_app', 'email'],
          })
        }
      } catch {
        // Notification failure must not roll back the approval
      }
    } else {
      // reject → cancelled_by_host
      await db.execute(
        `UPDATE bookings
         SET status = 'cancelled_by_host',
             cancelled_at = NOW(),
             cancellation_note = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [bookingId, reason ?? 'Booking declined by host'],
      )

      // Release Stripe hold on rejection
      const txRes = await db.execute(
        `SELECT stripe_payment_intent_id FROM transactions
         WHERE booking_id = $1 AND status = 'hold_placed' LIMIT 1`,
        [bookingId],
      )
      if (txRes.rows.length > 0) {
        const piId = (txRes.rows[0] as { stripe_payment_intent_id: string | null }).stripe_payment_intent_id
        if (piId) {
          const { StripeService } = await import('@/domains/payments/StripeService')
          await StripeService.cancelPaymentIntent(piId).catch((e: unknown) => {
            console.error('[bookings/host PATCH] Stripe cancel failed:', e)
          })
        }
      }
    }

    return apiResponse({ bookingId, action, updated: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[PATCH /api/v1/bookings/host]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
