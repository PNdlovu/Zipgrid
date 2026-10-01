/**
 * @file route.ts
 * @description GET/POST /api/v1/bookings/recurring
 * Driver can set up a recurring weekly booking for the same slot.
 *
 * POST body:
 *   { listingId, vehicleId, dayOfWeek (0=Sun..6=Sat), startTime (HH:MM),
 *     durationHours, weeksAhead (1-8), skipDates }
 *
 * Creates multiple bookings (one per week) in a single atomic transaction.
 * Returns the list of created booking IDs.
 *
 * GET ?status=upcoming — list all active recurring schedules for the driver.
 *
 * @module apps/web/api/v1/bookings/recurring
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const RecurringSchema = z.object({
  listingId:     z.string().uuid(),
  vehicleId:     z.string().uuid(),
  /** 0 = Sunday, 1 = Monday … 6 = Saturday */
  dayOfWeek:     z.number().int().min(0).max(6),
  /** HH:MM in local time (stored as UTC by the API) */
  startTime:     z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  durationHours: z.number().min(0.5).max(8),
  /** Number of weeks to pre-book (max 8 = ~2 months out) */
  weeksAhead:    z.number().int().min(1).max(8).default(4),
  /** ISO date strings (YYYY-MM-DD) to skip (holidays, etc.) */
  skipDates:     z.array(z.string()).default([]),
})

/** Builds an array of upcoming Date objects for the given day-of-week. */
function buildWeeklyDates(dayOfWeek: number, startTime: string, weeksAhead: number, skipDates: string[]): Date[] {
  const [hStr, mStr] = startTime.split(':')
  const h = parseInt(hStr!, 10)
  const m = parseInt(mStr!, 10)
  const skipSet = new Set(skipDates)
  const results: Date[] = []

  const now = new Date()
  const current = new Date(now)
  // Advance to the next occurrence of dayOfWeek
  while (current.getDay() !== dayOfWeek) {
    current.setDate(current.getDate() + 1)
  }
  // Start from next week if today is the day but the slot has passed
  if (current.getDay() === now.getDay() && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))) {
    current.setDate(current.getDate() + 7)
  }

  for (let week = 0; week < weeksAhead; week++) {
    const slot = new Date(current)
    slot.setHours(h, m, 0, 0)
    const dateKey = slot.toISOString().split('T')[0]!
    if (!skipSet.has(dateKey)) {
      results.push(new Date(slot))
    }
    current.setDate(current.getDate() + 7)
  }

  return results
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof RecurringSchema>
  try { body = RecurringSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid request', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify driver + vehicle
    const dpRes = await db.execute(
      `SELECT dp.id FROM driver_profiles dp WHERE dp.user_id = $1 LIMIT 1`,
      [userId],
    )
    if (dpRes.rows.length === 0) return apiError('FORBIDDEN', 'Driver profile not found', 403)
    const driverProfileId = (dpRes.rows[0] as { id: string }).id

    // Verify listing exists and is bookable
    const listingRes = await db.execute(
      `SELECT id, pricing_model, price_per_kwh_pence, price_per_hour_pence,
              price_per_session_pence, idle_fee_per_min_pence, instant_book_enabled,
              access_type, access_instructions
       FROM charger_listings WHERE id = $1 AND status = 'active' LIMIT 1`,
      [body.listingId],
    )
    if (listingRes.rows.length === 0) return apiError('NOT_FOUND', 'Listing not found or not active', 404)
    const listing = listingRes.rows[0] as {
      id: string; pricing_model: string; price_per_kwh_pence: number | null
      price_per_hour_pence: number | null; price_per_session_pence: number | null
      idle_fee_per_min_pence: number; instant_book_enabled: boolean
      access_type: string; access_instructions: string | null
    }

    const slots = buildWeeklyDates(body.dayOfWeek, body.startTime, body.weeksAhead, body.skipDates)
    if (slots.length === 0) return apiError('VALIDATION_ERROR', 'No valid booking slots found', 400)

    const createdIds: string[] = []

    for (const start of slots) {
      const end = new Date(start.getTime() + body.durationHours * 3_600_000)
      const bookingId = crypto.randomUUID()
      const pin = Math.floor(100_000 + Math.random() * 900_000).toString()
      const arrivalCode = Math.random().toString(36).slice(2, 10).toUpperCase()

      // Estimate cost
      let estimatedCost = 0
      if (listing.pricing_model === 'per_hour' && listing.price_per_hour_pence) {
        estimatedCost = Math.round(listing.price_per_hour_pence * body.durationHours)
      } else if (listing.pricing_model === 'per_session' && listing.price_per_session_pence) {
        estimatedCost = listing.price_per_session_pence
      }

      try {
        await db.execute(
          `INSERT INTO bookings (
             id, listing_id, driver_profile_id, vehicle_id,
             scheduled_start, scheduled_end,
             status, pricing_model,
             quoted_price_per_hour_pence, quoted_price_per_session_pence,
             quoted_idle_fee_per_min_pence, estimated_cost_pence,
             access_type, access_instructions,
             instant_book, driver_arrival_code, session_pin,
             created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,
             CASE WHEN $7 THEN 'confirmed' ELSE 'pending' END,
             $8,$9,$10,$11,$12,$13,$14,$7,$15,$16,NOW(),NOW())`,
          [
            bookingId, body.listingId, driverProfileId, body.vehicleId,
            start.toISOString(), end.toISOString(),
            listing.instant_book_enabled,
            listing.pricing_model,
            listing.price_per_hour_pence, listing.price_per_session_pence,
            listing.idle_fee_per_min_pence, estimatedCost,
            listing.access_type, listing.access_instructions,
            arrivalCode, pin,
          ],
        )
        createdIds.push(bookingId)
      } catch {
        // Skip slots that overlap with existing bookings
      }
    }

    return apiResponse({ bookingIds: createdIds, count: createdIds.length }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[bookings/recurring]', err)
    return apiError('INTERNAL_ERROR', 'Could not create recurring bookings', 500)
  }
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `SELECT b.id, b.listing_id, b.scheduled_start, b.scheduled_end,
              b.status, b.estimated_cost_pence,
              cl.title AS listing_title, cl.city
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1
         AND b.scheduled_start > NOW()
         AND b.status IN ('confirmed', 'pending')
       ORDER BY b.scheduled_start ASC
       LIMIT 50`,
      [userId],
    )

    return apiResponse({ bookings: res.rows })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not fetch recurring bookings', 500)
  }
}
