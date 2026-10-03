/**
 * @file page.tsx
 * @description /host/bookings — Host's incoming bookings.
 * Shows all bookings across all listings with approve/reject actions
 * for manual-approve listings, plus status tabs.
 *
 * @module apps/web/app/(host)/bookings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  CalendarDays, MapPin, ChevronRight, Loader2, Clock, CheckCircle, XCircle, AlertTriangle, PoundSterling, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type Booking = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  durationMinutes: number
  estimatedCostPence: number
  instantBook: boolean
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
  driverArrivalCode: string | null
}

type Tab = 'pending' | 'upcoming' | 'completed' | 'all'

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending',   label: 'Needs action' },
  { key: 'upcoming',  label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'all',       label: 'All' },
]

const STATUS_QUERY: Record<Tab, string | undefined> = {
  pending:   'pending',
  upcoming:  'confirmed,active',
  completed: 'completed',
  all:       undefined,
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  pending:              { label: 'Awaiting approval', dot: 'bg-amber-400' },
  confirmed:            { label: 'Confirmed',         dot: 'bg-[hsl(var(--primary))]' },
  active:               { label: 'In progress',       dot: 'bg-blue-500' },
  completed:            { label: 'Completed',         dot: 'bg-slate-400' },
  cancelled_by_driver:  { label: 'Cancelled',         dot: 'bg-[hsl(var(--destructive))]' },
  cancelled_by_host:    { label: 'You declined',      dot: 'bg-[hsl(var(--destructive))]' },
  cancelled_by_platform:{ label: 'Cancelled',         dot: 'bg-[hsl(var(--destructive))]' },
  no_show:              { label: 'No show',            dot: 'bg-slate-400' },
}

/* ── Helpers ─────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/* ── Booking card ─────────────────────────────────────────── */

function BookingCard({
  booking,
  onApprove,
  onReject,
  actionLoading,
}: {
  booking: Booking
  onApprove: (id: string) => void
  onReject: (id: string) => void
  actionLoading: string | null
}) {
  const cfg = STATUS_CONFIG[booking.status] ?? { label: booking.status, dot: 'bg-slate-400' }
  const isPending = booking.status === 'pending'

  return (
    <div className={cn(
      'rounded-[6px] border bg-[hsl(var(--card))] p-4 transition-colors',
      isPending
        ? 'border-amber-400/40 bg-amber-400/5'
        : 'border-[hsl(var(--border))]',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Status + listing */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', cfg.dot)} aria-hidden="true" />
            <span className="text-xs font-medium">{cfg.label}</span>
            {booking.instantBook && (
              <span className="rounded-full bg-[hsl(var(--primary)_/_10%)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                Instant
              </span>
            )}
          </div>

          <p className="mt-1 font-semibold text-sm line-clamp-1">
            {booking.listingTitle ?? 'Unknown listing'}
          </p>
          {booking.listingCity && (
            <p className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {booking.listingCity}
            </p>
          )}

          {/* Schedule */}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              {fmtDate(booking.scheduledStart)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {fmtDuration(booking.durationMinutes)}
            </span>
            <span className="flex items-center gap-1">
              <PoundSterling className="h-3 w-3" aria-hidden="true" />
              £{(booking.estimatedCostPence / 100).toFixed(2)} est.
            </span>
          </div>
        </div>

        {/* View link */}
        <Link
          href={`/host/bookings/${booking.id}`}
          className="shrink-0 rounded-[6px] border border-[hsl(var(--border))] p-1.5 hover:bg-[hsl(var(--muted))]"
          aria-label="View booking details"
        >
          <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        </Link>
      </div>

      {/* Approve / Reject for pending bookings */}
      {isPending && (
        <div className="mt-3 flex gap-2 border-t border-amber-400/20 pt-3">
          <button
            onClick={() => onApprove(booking.id)}
            disabled={actionLoading === booking.id}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-[hsl(var(--primary))] py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {actionLoading === booking.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Approve
          </button>
          <button
            onClick={() => onReject(booking.id)}
            disabled={actionLoading === booking.id}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[hsl(var(--destructive)_/_40%)] py-2 text-xs font-semibold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_8%)] disabled:opacity-60"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Decline
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */

/** Page at /host/bookings — Host's incoming bookings. */
export default function HostBookingsPage() {
  const [tab, setTab]                 = useState<Tab>('pending')
  const [bookings, setBookings]       = useState<Booking[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const PAGE_SIZE = 20

  const fetchBookings = useCallback(async (p: number, currentTab: Tab) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      const statusQuery = STATUS_QUERY[currentTab]
      if (statusQuery) params.set('status', statusQuery)

      const res = await fetch(`/api/v1/bookings/host?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load bookings')
      const data = (await res.json()) as { data: Booking[]; meta: { total: number } }
      setBookings(p === 1 ? data.data : (prev) => [...prev, ...data.data])
      setTotal(data.meta?.total ?? 0)
      setPage(p)
    } catch {
      setError('Failed to load bookings. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setBookings([])
    setPage(1)
    void fetchBookings(1, tab)
  }, [tab, fetchBookings])

  const handleAction = async (bookingId: string, action: 'approve' | 'reject') => {
    setActionLoading(bookingId)
    setActionError(null)
    try {
      const res = await fetch('/api/v1/bookings/host', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action }),
      })
      const json = (await res.json()) as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setActionError(json.error?.message ?? 'Action failed')
        return
      }
      // Remove from list immediately (optimistic) and refresh
      setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = bookings.filter((b) => b.status === 'pending').length
  const hasMore = bookings.length < total

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            {total} total{pendingCount > 0 && ` · ${pendingCount} need approval`}
          </p>
        </div>
        <button
          onClick={() => { void fetchBookings(1, tab) }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
          aria-label="Refresh bookings"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Action error */}
      {actionError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-2.5 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Booking status filter" className="mb-4 flex overflow-x-auto gap-1 rounded-[6px] bg-[hsl(var(--muted))] p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'shrink-0 rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors',
              tab === key
                ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            {label}
            {key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && bookings.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-[hsl(var(--border))] py-14 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">
            {tab === 'pending' ? 'No bookings needing approval' : 'No bookings found'}
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {tab === 'pending'
              ? 'New booking requests will appear here for your approval.'
              : 'Bookings will appear here once drivers start booking your listings.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              actionLoading={actionLoading}
              onApprove={(id) => { void handleAction(id, 'approve') }}
              onReject={(id) => { void handleAction(id, 'reject') }}
            />
          ))}
          {hasMore && (
            <button
              onClick={() => { void fetchBookings(page + 1, tab) }}
              disabled={loading}
              className="w-full rounded-[6px] border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              {loading ? 'Loading…' : `Load more (${total - bookings.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
