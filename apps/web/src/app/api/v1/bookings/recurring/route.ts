/**
 * @file route.ts
 * @description POST /api/v1/bookings/recurring — book the same weekly slot for
 *              several weeks. Each occurrence goes through BookingService.create
 *              (availability, double-booking lock, payment); occurrences more
 *              than HOLD_WINDOW_DAYS out secure payment (card hold or wallet
 *              reservation) 24h before they start.
 *              GET  /api/v1/bookings/recurring — the driver's upcoming recurring occurrences.
 *
 * Times are interpreted in the listing's local time zone (BST-aware).
 *
 * @module apps/web/api/v1/bookings/recurring
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { BookingService } from '@/domains/booking/BookingService'
import { localParts, localToUtc, timeZoneFor } from '@/domains/charging/AvailabilityService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { AppError } from '@/lib/errors/AppError'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const RecurringSchema = z.object({
  listingId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/, 'Invalid paymentMethodId').optional(),
  payWithWallet: z.boolean().optional().default(false),
  /** 0 = Sunday, 1 = Monday … 6 = Saturday */
  dayOfWeek: z.number().int().min(0).max(6),
  /** HH:MM in the listing's local time */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:MM'),
  durationHours: z.number().min(0.5).max(12),
  weeksAhead: z.number().int().min(1).max(8).default(4),
  /** Local dates (YYYY-MM-DD) to skip */
  skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(20).default([]),
}).refine((d) => d.payWithWallet !== Boolean(d.paymentMethodId), {
  message: 'Provide either paymentMethodId or payWithWallet: true',
})

/** Next `weeks` local dates falling on `dayOfWeek`, starting today. */
function upcomingDates(dayOfWeek: number, weeks: number, timeZone: string): string[] {
  const out: string[] = []
  let cursor = Date.now()
  while (WEEKDAYS.indexOf(localParts(new Date(cursor), timeZone).weekday) !== dayOfWeek) cursor += 86_400_000
  for (let i = 0; i < weeks; i++) {
    out.push(localParts(new Date(cursor + i * 7 * 86_400_000), timeZone).date)
  }
  return out
}

/** POST /api/v1/bookings/recurring — book the same weekly slot for several weeks. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = RecurringSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }
    const input = parsed.data

    const db = await getDb()
    const listing = await db.execute(`SELECT country_code FROM charger_listings WHERE id = $1`, [input.listingId])
    if (listing.rows.length === 0) return apiError('NOT_FOUND', 'Listing not found', 404)
    const timeZone = timeZoneFor(listing.rows[0]?.['country_code'] as string | null)

    const skip = new Set(input.skipDates)
    const seriesId = uuidv4()
    const created: string[] = []
    const skipped: { start: string; reason: string }[] = []

    for (const date of upcomingDates(input.dayOfWeek, input.weeksAhead + 1, timeZone)) {
      if (created.length + skipped.length >= input.weeksAhead) break
      if (skip.has(date)) continue
      const start = localToUtc(date, input.startTime, timeZone)
      if (start.getTime() <= Date.now()) continue // today's slot already passed
      const end = new Date(start.getTime() + input.durationHours * 3_600_000)
      try {
        const booking = await BookingService.create({
          userId,
          listingId: input.listingId,
          vehicleId: input.vehicleId,
          scheduledStart: start,
          scheduledEnd: end,
          paymentMethodId: input.paymentMethodId ?? null,
          payWithWallet: input.payWithWallet,
          recurringSeriesId: seriesId,
        })
        created.push(booking.id)
      } catch (err) {
        // Validation/availability problems skip the week; anything else aborts.
        if (err instanceof AppError && err.statusCode < 500 && err.code !== 'UNAUTHORIZED') {
          skipped.push({ start: start.toISOString(), reason: err.message })
          continue
        }
        throw err
      }
    }

    return apiResponse(
      { seriesId, bookingIds: created, count: created.length, skipped },
      undefined,
      created.length > 0 ? 201 : 200,
    )
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/bookings/recurring')
  }
}

/** GET /api/v1/bookings/recurring — the driver's upcoming recurring occurrences. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const db = await getDb()
    const res = await db.execute(
      `SELECT b.id, b.recurring_series_id, b.listing_id, b.scheduled_start, b.scheduled_end,
              b.status, b.estimated_cost_cents AS estimated_cost_pence,
              cl.title AS listing_title, cl.city
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1
         AND b.recurring_series_id IS NOT NULL
         AND b.scheduled_start > NOW()
         AND b.status IN ('confirmed', 'pending')
       ORDER BY b.scheduled_start ASC
       LIMIT 100`,
      [userId],
    )
    return apiResponse({ bookings: res.rows })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/bookings/recurring')
  }
}
