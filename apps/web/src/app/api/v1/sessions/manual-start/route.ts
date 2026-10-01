/**
 * @file route.ts
 * @description POST /api/v1/sessions/manual-start
 * Creates a charging session for a non-smart (non-OCPP) charger.
 * Driver must supply the correct 6-digit session PIN to confirm
 * physical presence at the charger.
 *
 * Validates:
 *   - Booking belongs to the authenticated driver
 *   - Booking status is 'confirmed'
 *   - Scheduled window has started (within 15 min before/after start)
 *   - PIN matches the booking's session_pin
 *   - No existing session for this booking
 *   - Listing is NOT a smart charger (smart chargers use OCPP)
 *
 * @module apps/web/api/v1/sessions/manual-start
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors/AppError'

const BodySchema = z.object({
  bookingId: z.string().uuid(),
  pin:       z.string().length(6).regex(/^\d{6}$/, 'PIN must be 6 digits'),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await request.json())
  } catch {
    return apiError('VALIDATION_ERROR', 'bookingId and a 6-digit pin are required', 400)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // ── 1. Fetch booking with driver + listing info ──────────────
    const bookingRes = await db.execute(
      `SELECT
         b.id, b.status, b.session_pin, b.scheduled_start, b.scheduled_end,
         b.listing_id, b.driver_profile_id,
         cl.is_smart_charger, cl.ocpp_charge_point_id,
         dp.user_id AS driver_user_id
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
       WHERE b.id = $1
       LIMIT 1`,
      [body.bookingId],
    )

    if (bookingRes.rows.length === 0) throw new NotFoundError('Booking', body.bookingId)
    const booking = bookingRes.rows[0] as {
      id: string
      status: string
      session_pin: string
      scheduled_start: string
      scheduled_end: string
      listing_id: string
      driver_profile_id: string
      is_smart_charger: boolean
      ocpp_charge_point_id: string | null
      driver_user_id: string
    }

    // ── 2. Authorise ─────────────────────────────────────────────
    if (booking.driver_user_id !== userId) {
      throw new ForbiddenError('You are not the driver on this booking')
    }

    // ── 3. Validate booking state ─────────────────────────────────
    if (booking.status !== 'confirmed') {
      throw new ValidationError(
        `Booking is ${booking.status} — only confirmed bookings can be started.`,
        'BOOKING_NOT_CONFIRMED',
      )
    }

    // ── 4. Block smart chargers — they use OCPP remote start ─────
    if (booking.is_smart_charger) {
      throw new ValidationError(
        'This charger supports OCPP. Use the standard booking flow — the session will start automatically.',
        'SMART_CHARGER_USE_OCPP',
      )
    }

    // ── 5. Check timing window (15 min before → 30 min after start) ─
    const now = Date.now()
    const scheduledStart = new Date(booking.scheduled_start).getTime()
    const windowOpen  = scheduledStart - 15 * 60_000   // 15 min early
    const windowClose = scheduledStart + 30 * 60_000   // 30 min grace

    if (now < windowOpen) {
      const minsUntil = Math.ceil((windowOpen - now) / 60_000)
      throw new ValidationError(
        `Your booking window opens in ${minsUntil} minute${minsUntil !== 1 ? 's' : ''}.`,
        'TOO_EARLY',
      )
    }
    if (now > new Date(booking.scheduled_end).getTime()) {
      throw new ValidationError('Your booking window has passed.', 'BOOKING_EXPIRED')
    }
    if (now > windowClose) {
      throw new ValidationError(
        'The 30-minute arrival window has closed. Please contact support if you need assistance.',
        'ARRIVAL_WINDOW_CLOSED',
      )
    }

    // ── 6. Verify PIN ─────────────────────────────────────────────
    if (body.pin !== booking.session_pin) {
      throw new ValidationError('Incorrect PIN. Please check your booking confirmation.', 'INVALID_PIN')
    }

    // ── 7. Check for duplicate session ───────────────────────────
    const existingRes = await db.execute(
      `SELECT id FROM charging_sessions WHERE booking_id = $1 LIMIT 1`,
      [booking.id],
    )
    if (existingRes.rows.length > 0) {
      const existingId = (existingRes.rows[0] as { id: string }).id
      return apiResponse({ sessionId: existingId, alreadyStarted: true })
    }

    // ── 8. Create the manual charging session ────────────────────
    const sessionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()

    await db.execute(
      `INSERT INTO charging_sessions (
         id, booking_id, ocpp_charge_point_id, ocpp_connector_id,
         status, started_at, authorized_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 1, 'charging', $4, $4, NOW(), NOW())`,
      [
        sessionId,
        booking.id,
        booking.ocpp_charge_point_id ?? `manual-${booking.id.slice(0, 8)}`,
        startedAt,
      ],
    )

    // Update booking status to reflect active session
    await db.execute(
      `UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [booking.id],
    )

    return apiResponse({ sessionId, alreadyStarted: false }, 201)
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    }
    console.error('[manual-start]', err)
    return apiError('INTERNAL_ERROR', 'Could not start session', 500)
  }
}
