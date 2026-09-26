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
import { getDb } from '@/lib/db'

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
  async isAvailable(
    listingId: string,
    scheduledStart: Date,
    scheduledEnd: Date,
  ): Promise<boolean> {
    const db = await getDb()
    const dateStr = scheduledStart.toISOString().split('T')[0]!

    // 1. Check blackout
    const blackout = await db.execute(
      `SELECT id FROM listing_blackout_dates WHERE listing_id = $1 AND blackout_date = $2 LIMIT 1`,
      [listingId, dateStr],
    )
    if (blackout.rows.length > 0) return false

    // 2. Check weekly schedule
    const dayOfWeek = scheduledStart
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase() as ScheduleDay['dayOfWeek']
    const schedule = await db.execute(
      `SELECT open_time, close_time, is_available
       FROM listing_availability_schedules
       WHERE listing_id = $1 AND day_of_week = $2 LIMIT 1`,
      [listingId, dayOfWeek],
    )
    if (schedule.rows.length > 0) {
      const row = schedule.rows[0] as { open_time: string; close_time: string; is_available: boolean }
      if (!row.is_available) return false
      const requestStart = scheduledStart.toTimeString().slice(0, 5) // HH:MM
      const requestEnd = scheduledEnd.toTimeString().slice(0, 5)
      if (requestStart < row.open_time || requestEnd > row.close_time) return false
    }

    // 3. Check booking overlap
    const overlap = await db.execute(
      `SELECT id FROM bookings
       WHERE listing_id = $1
         AND status NOT IN ('cancelled', 'no_show')
         AND scheduled_start < $3 AND scheduled_end > $2
       LIMIT 1`,
      [listingId, scheduledStart.toISOString(), scheduledEnd.toISOString()],
    )
    return overlap.rows.length === 0
  },
}
