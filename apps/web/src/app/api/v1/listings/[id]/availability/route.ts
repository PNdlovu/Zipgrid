/**
 * @file route.ts
 * @description GET /api/v1/listings/[id]/availability
 * Returns the full availability picture for a listing so the booking form
 * can show a calendar: weekly schedule, blackout dates, and existing bookings
 * for the next 90 days.
 *
 * Public endpoint — no authentication required.
 * Callers use this to grey out unavailable slots before submitting a booking.
 *
 * Query params:
 *   from  — ISO date (default: today)
 *   days  — window length in days (default: 90, max: 180)
 *
 * @module apps/web/api/v1/listings/[id]/availability
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { AvailabilityService } from '@/domains/charging/AvailabilityService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { id: listingId } = await params
  const { searchParams } = request.nextUrl

  // Parse window
  const fromParam = searchParams.get('from')
  const from = fromParam ? new Date(fromParam) : new Date()
  if (isNaN(from.getTime())) {
    return apiError('VALIDATION_ERROR', 'from must be a valid ISO date', 422)
  }
  from.setHours(0, 0, 0, 0)

  const days = Math.min(180, Math.max(1, parseInt(searchParams.get('days') ?? '90', 10)))
  const to = new Date(from.getTime() + days * 86_400_000)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify listing exists and is active
    const listingRes = await db.execute(
      `SELECT id, status FROM charger_listings WHERE id = $1 LIMIT 1`,
      [listingId],
    )
    if (listingRes.rows.length === 0) {
      return apiError('NOT_FOUND', 'Listing not found', 404)
    }

    // Fetch schedule, blackouts, and existing confirmed/active bookings in parallel
    const [schedule, blackouts, bookingsRes] = await Promise.all([
      AvailabilityService.getSchedule(listingId),
      AvailabilityService.getBlackouts(listingId, from.toISOString(), to.toISOString()),
      db.execute(
        `SELECT scheduled_start, scheduled_end, status
         FROM bookings
         WHERE listing_id = $1
           AND status IN ('pending', 'confirmed', 'active')
           AND scheduled_start < $3
           AND scheduled_end > $2
         ORDER BY scheduled_start ASC`,
        [listingId, from.toISOString(), to.toISOString()],
      ),
    ])

    return apiResponse({
      listingId,
      window: { from: from.toISOString(), to: to.toISOString(), days },
      // Weekly recurring schedule (7 day-of-week entries)
      weeklySchedule: schedule,
      // Specific dates that are completely blocked
      blackoutDates: blackouts.map((b) =>
        typeof b === 'string' ? b : (b as { date: string }).date,
      ),
      // Existing bookings in the window (start/end times, no driver detail)
      existingBookings: bookingsRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          scheduledStart: row['scheduled_start'],
          scheduledEnd:   row['scheduled_end'],
          status:         row['status'],
        }
      }),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
