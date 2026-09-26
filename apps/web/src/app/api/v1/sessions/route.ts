/**
 * @file route.ts
 * @description GET /api/v1/sessions — authenticated user's session history.
 *              POST /api/v1/sessions — start a new charging session.
 *
 * @module apps/web/api/v1/sessions
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const StartSessionSchema = z.object({
  bookingId: z.string().uuid(),
  chargePointId: z.string().min(1),
  connectorId: z.number().int().positive().default(1),
})

/**
 * POST /api/v1/sessions — start a charging session via OCPP RemoteStart.
 *
 * Flow:
 * 1. Validate booking ownership
 * 2. Generate idTag for this session
 * 3. Send RemoteStartTransaction to OCPP service
 * 4. Create session row in DB
 * 5. Return session ID to client
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = StartSessionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify booking belongs to this user and is in confirmed state
    const bookingResult = await db.execute(
      `SELECT b.id, b.listing_id, b.status, cl.ocpp_charge_point_id, cl.price_per_kwh_cents
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       WHERE b.id = $1 AND b.driver_id = (SELECT id FROM driver_profiles WHERE user_id = $2)
       LIMIT 1`,
      [parsed.data.bookingId, userId],
    )

    if (bookingResult.rows.length === 0) {
      return apiError('NOT_FOUND', 'Booking not found', 404)
    }

    const booking = bookingResult.rows[0] as {
      id: string; listing_id: string; status: string;
      ocpp_charge_point_id: string | null; price_per_kwh_cents: number | null
    }

    if (booking.status !== 'confirmed') {
      return apiError('INVALID_STATE', `Booking status is ${booking.status} — cannot start session`, 400)
    }

    const sessionId = uuidv4()
    const idTag = `ZG-${sessionId.slice(0, 8).toUpperCase()}-SESS`
    const chargePointId = parsed.data.chargePointId || booking.ocpp_charge_point_id

    if (!chargePointId) {
      return apiError('MISSING_CHARGER', 'No OCPP charger linked to this listing', 400)
    }

    // Send RemoteStart to OCPP service
    const ocppResult = await OcppService.remoteStart(chargePointId, parsed.data.connectorId, idTag)
    if (ocppResult.status !== 'Accepted') {
      return apiError('OCPP_REJECTED', 'Charger rejected the start command — it may be offline or busy', 400)
    }

    // Create session row
    await db.execute(
      `INSERT INTO charging_sessions
         (id, booking_id, charge_point_id, connector_id, status, ocpp_id_tag,
          price_per_kwh_cents, energy_consumed_wh, total_cost_pence, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'preparing', $5, $6, 0, 0, NOW(), NOW())`,
      [sessionId, booking.id, chargePointId, parsed.data.connectorId, idTag, booking.price_per_kwh_cents ?? 0],
    )

    return apiResponse({ sessionId, idTag, status: 'preparing' }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/sessions]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** GET /api/v1/sessions — session history for current user */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const result = await db.execute(
      `SELECT cs.id, cs.status, cs.energy_consumed_wh, cs.total_cost_pence,
              cs.started_at, cs.ended_at, cs.charge_point_id,
              cl.title AS listing_title, cl.city
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN driver_profiles dp ON dp.id = b.driver_id
       WHERE dp.user_id = $1
       ORDER BY cs.created_at DESC
       LIMIT 50`,
      [userId],
    )

    return apiResponse(result.rows)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
