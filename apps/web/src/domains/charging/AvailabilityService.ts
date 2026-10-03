/**
 * @file AvailabilityService.ts
 * @description Listing availability service — weekly schedule, blackout dates,
 * and real-time availability checks (excludes booked slots).
 *
 * @module domains/charging
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, type Db } from '@/lib/db'
import { ForbiddenError, NotFoundError } from '@/lib/errors/AppError'

/** IANA time zone used to interpret a listing's schedule. */
export function timeZoneFor(countryCode: string | null): string {
  switch ((countryCode ?? 'GB').toUpperCase()) {
    case 'IE': return 'Europe/Dublin'
    case 'FR': return 'Europe/Paris'
    case 'DE': case 'NL': case 'BE': case 'ES': case 'IT': return 'Europe/Berlin'
    case 'US': return 'America/New_York'
    default: return 'Europe/London'
  }
}

/** Local calendar date (YYYY-MM-DD), weekday and HH:MM of an instant in `timeZone`. */
export function localParts(at: Date, timeZone: string): { date: string; weekday: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    weekday: String(parts['weekday']).toLowerCase(),
    time: `${parts['hour']}:${parts['minute']}`,
  }
}

/**
 * Converts a wall-clock date/time in `timeZone` (e.g. "2026-10-05", "09:00",
 * Europe/London) to the corresponding UTC instant, honouring DST.
 */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi)
  let guess = wallAsUtc
  // Two passes converge across DST transitions.
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone)
    const [py, pmo, pd] = p.date.split('-').map(Number) as [number, number, number]
    const [ph, pmi] = p.time.split(':').map(Number) as [number, number]
    guess += wallAsUtc - Date.UTC(py, pmo - 1, pd, ph, pmi)
  }
  return new Date(guess)
}

/** Throws unless `userId` is the host who owns `listingId`. */
export async function assertListingOwner(listingId: string, userId: string): Promise<void> {
  const db = await getDb()
  const res = await db.execute(
    `SELECT hp.user_id FROM charger_listings cl
     JOIN host_profiles hp ON hp.id = cl.host_profile_id
     WHERE cl.id = $1`,
    [listingId],
  )
  const owner = res.rows[0]?.['user_id']
  if (!owner) throw new NotFoundError('Listing', listingId)
  if (owner !== userId) throw new ForbiddenError('You do not own this listing')
}

export type ScheduleDay = {
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  openTime: string  // HH:MM
  closeTime: string // HH:MM
  isAvailable: boolean
}

export type AvailabilitySlot = {
  date: string  // YYYY-MM-DD
  openTime: string
  closeTime: string
  isBooked: boolean
}

/**
 * Availability service for the Charging bounded context.
 */
export const AvailabilityService = {
  /**
   * Upserts the weekly availability schedule for a listing.
   * One row per day_of_week per listing (unique constraint).
   */
  async setSchedule(listingId: string, schedule: ScheduleDay[]): Promise<void> {
    const db = await getDb()
    for (const day of schedule) {
      await db.execute(
        `INSERT INTO listing_availability_schedules
           (id, listing_id, day_of_week, open_time, close_time, is_available)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (listing_id, day_of_week) DO UPDATE
         SET open_time = $4, close_time = $5, is_available = $6`,
        [uuidv4(), listingId, day.dayOfWeek, day.openTime, day.closeTime, day.isAvailable],
      )
    }
  },

  /**
   * Retrieves the weekly schedule for a listing.
   */
  async getSchedule(listingId: string): Promise<ScheduleDay[]> {
    const db = await getDb()
    const result = await db.execute(
      `SELECT day_of_week, open_time, close_time, is_available
       FROM listing_availability_schedules
       WHERE listing_id = $1
       ORDER BY CASE day_of_week
         WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
         WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
         WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
       END`,
      [listingId],
    )
    return result.rows.map((r) => ({
      dayOfWeek: r['day_of_week'] as ScheduleDay['dayOfWeek'],
      openTime: r['open_time'] as string,
      closeTime: r['close_time'] as string,
      isAvailable: Boolean(r['is_available']),
    }))
  },

  /**
   * Adds a blackout date to a listing.
   */
  async addBlackout(listingId: string, date: string, reason?: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `INSERT INTO listing_blackout_dates (id, listing_id, blackout_date, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (listing_id, blackout_date) DO UPDATE SET reason = $4`,
      [uuidv4(), listingId, date, reason ?? null],
    )
  },

  /**
   * Removes a blackout date.
   */
  async removeBlackout(listingId: string, date: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `DELETE FROM listing_blackout_dates WHERE listing_id = $1 AND blackout_date = $2`,
      [listingId, date],
    )
  },

  /**
   * Returns blackout dates for a listing in a date range.
   */
  async getBlackouts(listingId: string, fromDate: string, toDate: string): Promise<string[]> {
    const db = await getDb()
    const result = await db.execute(
      `SELECT blackout_date::TEXT AS date FROM listing_blackout_dates
       WHERE listing_id = $1 AND blackout_date BETWEEN $2 AND $3
       ORDER BY blackout_date`,
      [listingId, fromDate, toDate],
    )
    return result.rows.map((r) => r['date'] as string)
  },

  /**
   * Checks whether a listing is available for a given date/time range,
   * accounting for: weekly schedule, blackout dates, and existing bookings.
   */
  /**
   * Schedules and blackout dates are in the listing's local time (UK listings:
   * Europe/London, so BST is respected). Existing bookings block the slot
   * including the listing's buffer_minutes on either side.
   *
   * Pass `db` to run inside a caller's transaction (BookingService does, after
   * taking the per-listing lock).
   */
  async isAvailable(
    listingId: string,
    scheduledStart: Date,
    scheduledEnd: Date,
    db?: Db,
  ): Promise<boolean> {
    const conn = db ?? (await getDb())
    const listingRes = await conn.execute(
      `SELECT country_code, COALESCE(buffer_minutes, 0) AS buffer_minutes
       FROM charger_listings WHERE id = $1`,
      [listingId],
    )
    const listing = listingRes.rows[0]
    if (!listing) return false
    const timeZone = timeZoneFor(listing['country_code'] as string | null)
    const start = localParts(scheduledStart, timeZone)
    const end = localParts(scheduledEnd, timeZone)

    // 1. Blackout on either local date
    const blackout = await conn.execute(
      `SELECT 1 FROM listing_blackout_dates
       WHERE listing_id = $1 AND blackout_date BETWEEN $2::date AND $3::date LIMIT 1`,
      [listingId, start.date, end.date],
    )
    if (blackout.rows.length > 0) return false

    // 2. Weekly schedule (no rows = available 24/7)
    const schedule = await conn.execute(
      `SELECT day_of_week::text AS day, to_char(open_time, 'HH24:MI') AS open_time,
              to_char(close_time, 'HH24:MI') AS close_time, is_available
       FROM listing_availability_schedules WHERE listing_id = $1`,
      [listingId],
    )
    if (schedule.rows.length > 0) {
      // Scheduled listings can only be booked within a single local day's window.
      if (start.date !== end.date && end.time !== '00:00') return false
      const day = schedule.rows.find((r) => r['day'] === start.weekday)
      if (!day || !day['is_available']) return false
      const endTime = end.time === '00:00' && start.date !== end.date ? '24:00' : end.time
      if (start.time < (day['open_time'] as string)) return false
      const close = day['close_time'] === '00:00' ? '24:00' : (day['close_time'] as string)
      if (endTime > close) return false
    }

    // 3. Overlap with live bookings, padded by the buffer
    const overlap = await conn.execute(
      `SELECT 1 FROM bookings
       WHERE listing_id = $1
         AND status IN ('pending', 'confirmed', 'active')
         AND scheduled_start < $3::timestamptz + make_interval(mins => $4)
         AND scheduled_end   > $2::timestamptz - make_interval(mins => $4)
       LIMIT 1`,
      [listingId, scheduledStart.toISOString(), scheduledEnd.toISOString(), Number(listing['buffer_minutes'])],
    )
    return overlap.rows.length === 0
  },
}
