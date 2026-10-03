/**
 * @file BookingCard.tsx
 * @description Reusable booking list item — links to the booking detail page.
 * Used in driver booking history and host booking list.
 * @module components/booking
 */

import Link from 'next/link'
import { CalendarDays, MapPin, PoundSterling, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookingStatusBadge } from './BookingStatusBadge'

export type BookingCardData = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  estimatedCostPence: number
  listingTitle: string | null
  listingCity: string | null
  hostName?: string | null
  driverName?: string | null
}

type BookingCardProps = {
  booking: BookingCardData
  /** 'driver' links to /driver/bookings/[id]; 'host' links to /host/bookings/[id] */
  role: 'driver' | 'host'
  className?: string
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Booking list row — links to driver or host booking detail. */
export function BookingCard({ booking, role, className }: BookingCardProps) {
  const href = role === 'driver'
    ? `/bookings/${booking.id}`
    : `/host/bookings/${booking.id}`

  const counterparty = role === 'driver' ? booking.hostName : booking.driverName

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
        'px-4 py-3.5 transition-colors hover:bg-[hsl(var(--secondary))]',
        className,
      )}
    >
      {/* Left — date + time */}
      <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-[6px] bg-[hsl(var(--secondary))] px-2.5 py-2 text-center">
        <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {new Date(booking.scheduledStart).toLocaleDateString('en-GB', { month: 'short' })}
        </span>
        <span className="font-mono text-lg font-bold text-[hsl(var(--foreground))]">
          {new Date(booking.scheduledStart).getDate()}
        </span>
      </div>

      {/* Middle — listing + details */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
            {booking.listingTitle ?? 'Booking'}
          </p>
          <BookingStatusBadge status={booking.status} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          {booking.listingCity && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              {booking.listingCity}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
            {fmtDate(booking.scheduledStart)} · {fmtTime(booking.scheduledStart)}–{fmtTime(booking.scheduledEnd)}
          </span>
          {counterparty && (
            <span className="truncate">{counterparty}</span>
          )}
        </div>
      </div>

      {/* Right — cost + chevron */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="flex items-center gap-0.5 font-mono text-sm font-semibold text-[hsl(var(--foreground))]">
          <PoundSterling className="h-3 w-3" aria-hidden="true" />
          {(booking.estimatedCostPence / 100).toFixed(2)}
        </span>
        <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      </div>
    </Link>
  )
}
