/**
 * @file dates.ts
 * @description Date formatting and manipulation utilities using date-fns.
 * @module @zipgrid/utils
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { format, formatDistance, isToday, isTomorrow, addMinutes } from 'date-fns'
import { enGB } from 'date-fns/locale'

/**
 * Formats a booking time slot for display.
 * @example formatSlot(start, end) // "Today, 10:00 – 12:00"
 */
export function formatSlot(start: Date, end: Date): string {
  const dayLabel = isToday(start)
    ? 'Today'
    : isTomorrow(start)
      ? 'Tomorrow'
      : format(start, 'EEE d MMM', { locale: enGB })
  return `${dayLabel}, ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
}

/**
 * Formats a duration in minutes to a human-readable string.
 * @example formatDuration(90) // "1h 30m"
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Formats a relative time string (e.g. "3 minutes ago").
 */
export function formatRelative(date: Date): string {
  return formatDistance(date, new Date(), { addSuffix: true, locale: enGB })
}

/**
 * Adds minutes to a date and returns the new date.
 */
export function addMinutesToDate(date: Date, minutes: number): Date {
  return addMinutes(date, minutes)
}
