/**
 * @file page.tsx
 * @description /driver/bookings — Driver's booking history with status badges,
 * tab filter (upcoming / past / all), and deep-link to booking detail.
 *
 * @module apps/web/app/(driver)/bookings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  CalendarDays, MapPin, ChevronRight, Loader2,
  Clock, PoundSterling, Zap, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type BookingRow = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  durationMinutes: number
  estimatedCostPence: number
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
  instantBook: boolean
}

/* ── Status config ───────────────────────────────────────────── */

type StatusKey =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled_by_driver'
  | 'cancelled_by_host'
  | 'cancelled_by_platform'
  | 'no_show'

const STATUS_CONFIG: Record<
  StatusKey,
  { label: string; color: string; bg: string; dot: string }
> = {
  pending: {
    label: 'Pending',
    color: 'text-yellow-600',
    bg: 'bg-yellow-500/10',
    dot: 'bg-yellow-500',
  },
  confirmed: {
    label: 'Confirmed',
    color: 'text-[hsl(var(--primary))]',
    bg: 'bg-[hsl(var(--primary)/0.1)]',
    dot: 'bg-[hsl(var(--primary))]',
  },
  active: {
    label: 'Active',
    color: 'text-[hsl(var(--primary))]',
    bg: 'bg-[hsl(var(--primary)/0.1)]',
    dot: 'bg-[hsl(var(--primary))]',
  },
  completed: {
    label: 'Completed',
    color: 'text-[hsl(var(--muted-foreground))]',
    bg: 'bg-[hsl(var(--secondary))]',
    dot: 'bg-[hsl(var(--muted-foreground))]',
  },
  cancelled_by_driver: {
    label: 'Cancelled',
    color: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.08)]',
    dot: 'bg-[hsl(var(--destructive))]',
  },
  cancelled_by_host: {
    label: 'Cancelled by host',
    color: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.08)]',
    dot: 'bg-[hsl(var(--destructive))]',
  },
  cancelled_by_platform: {
    label: 'Cancelled',
    color: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.08)]',
    dot: 'bg-[hsl(var(--destructive))]',
  },
  no_show: {
    label: 'No show',
    color: 'text-[hsl(var(--muted-foreground))]',
    bg: 'bg-[hsl(var(--secondary))]',
    dot: 'bg-[hsl(var(--muted-foreground))]',
  },
}

const FALLBACK_STATUS = {
  label: 'Unknown',
  color: 'text-[hsl(var(--muted-foreground))]',
  bg: 'bg-[hsl(var(--secondary))]',
  dot: 'bg-[hsl(var(--muted-foreground))]',
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function isUpcoming(b: BookingRow): boolean {
  return (
    ['pending', 'confirmed', 'active'].includes(b.status) &&
    new Date(b.scheduledStart) > new Date()
  )
}

function isPast(b: BookingRow): boolean {
  return (
    ['completed', 'cancelled_by_driver', 'cancelled_by_host', 'cancelled_by_platform', 'no_show'].includes(b.status) ||
    new Date(b.scheduledEnd) < new Date()
  )
}

/* ── Booking card ────────────────────────────────────────────── */

function BookingCard({ booking }: { booking: BookingRow }) {
  const cfg = STATUS_CONFIG[booking.status as StatusKey] ?? FALLBACK_STATUS
  const costPounds = (booking.estimatedCostPence / 100).toFixed(2)

  return (
    <Link
      href={`/bookings/${booking.id}`}
      className={cn(
        'flex items-center gap-4 rounded-[8px] border border-[hsl(var(--border))]',
        'bg-[hsl(var(--card))] px-4 py-4 transition-colors hover:bg-[hsl(var(--secondary)/0.4)]',
      )}
      aria-label={`Booking at ${booking.listingTitle ?? 'charger'} on ${formatDateShort(booking.scheduledStart)}, status: ${cfg.label}`}
    >
      {/* Status dot */}
      <div
        className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', cfg.dot)}
        aria-hidden="true"
      />

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
          {booking.listingTitle ?? 'Charger booking'}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {booking.listingCity && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {booking.listingCity}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden="true" />
            {formatDateShort(booking.scheduledStart)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatTimeRange(booking.scheduledStart, booking.scheduledEnd)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-xs">
          {/* Status badge */}
          <span className={cn('rounded-full px-2 py-0.5 font-medium', cfg.bg, cfg.color)}>
            {cfg.label}
          </span>
          {/* Duration */}
          <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
            <Zap className="h-3 w-3" aria-hidden="true" />
            {formatDuration(booking.durationMinutes)}
          </span>
          {/* Cost */}
          <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
            <PoundSterling className="h-3 w-3" aria-hidden="true" />
            ~£{costPounds}
          </span>
        </div>
      </div>

      <ChevronRight className="h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
    </Link>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

type Tab = 'upcoming' | 'past' | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
]

export default function BookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const fetchBookings = useCallback(async (currentPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      })
      const res = await fetch(`/api/v1/bookings/driver?${params.toString()}`)
      const json = await res.json() as {
        success: boolean
        data?: BookingRow[]
        meta?: { total?: number }
        error?: { message: string }
      }
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to load bookings')
        return
      }
      setBookings(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBookings(page)
  }, [fetchBookings, page])

  // Tab filter applied client-side (all bookings fetched, then filtered)
  const filtered = bookings.filter((b) => {
    if (tab === 'upcoming') return isUpcoming(b)
    if (tab === 'past') return isPast(b)
    return true
  })

  const hasMore = bookings.length < total

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="border-b border-[hsl(var(--border))] px-4 py-5">
        <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">My Bookings</h1>
        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
          {total > 0 ? `${total} booking${total !== 1 ? 's' : ''}` : 'No bookings yet'}
        </p>
      </header>

      {/* Tabs */}
      <div
        className="flex border-b border-[hsl(var(--border))]"
        role="tablist"
        aria-label="Booking filters"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors',
              tab === id
                ? 'border-b-2 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-4" role="tabpanel" aria-label={`${tab} bookings`}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading bookings" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
            <button
              type="button"
              onClick={() => void fetchBookings(page)}
              className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <CalendarDays
              className="h-12 w-12 text-[hsl(var(--muted-foreground))]"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">
                {tab === 'upcoming' ? 'No upcoming bookings' : tab === 'past' ? 'No past bookings' : 'No bookings yet'}
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {tab === 'upcoming'
                  ? 'Find a charger near you to get started.'
                  : 'Your completed and cancelled bookings will appear here.'}
              </p>
            </div>
            {tab === 'upcoming' && (
              <Link
                href="/map"
                className={cn(
                  'flex h-10 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-5',
                  'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                )}
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Find a charger
              </Link>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Booking list">
            {filtered.map((b) => (
              <li key={b.id}>
                <BookingCard booking={b} />
              </li>
            ))}
          </ul>
        )}

        {/* Load more */}
        {!loading && !error && hasMore && tab === 'all' && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
            >
              Load more
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
