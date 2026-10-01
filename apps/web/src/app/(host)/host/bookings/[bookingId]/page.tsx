/**
 * @file page.tsx
 * @description /host/bookings/[bookingId] — Host view of a single booking.
 * Shows driver details, booking schedule, session history, access pin,
 * and approve/reject actions for pending bookings.
 *
 * @module apps/web/app/(host)/bookings/[bookingId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CalendarDays, Clock, PoundSterling, Zap,
  User, MapPin, CheckCircle, XCircle, AlertTriangle,
  Loader2, Shield, BatteryCharging,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type BookingDetail = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  durationMinutes: number
  estimatedCostPence: number
  pricingModel: string
  accessType: string
  instantBook: boolean
  driverArrivalCode: string | null
  sessionPin: string | null
  confirmedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  stripePaymentIntentId: string | null
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
  createdAt: string
  updatedAt: string
}

/* ── Status config ───────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:               { label: 'Awaiting your approval', color: 'text-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  confirmed:             { label: 'Confirmed',              color: 'text-[hsl(var(--primary))]', bg: 'bg-[hsl(var(--primary)_/_8%)]' },
  active:                { label: 'Session in progress',    color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  completed:             { label: 'Completed',              color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--muted))]' },
  cancelled_by_driver:   { label: 'Cancelled by driver',    color: 'text-[hsl(var(--destructive))]', bg: 'bg-[hsl(var(--destructive)_/_8%)]' },
  cancelled_by_host:     { label: 'You declined',           color: 'text-[hsl(var(--destructive))]', bg: 'bg-[hsl(var(--destructive)_/_8%)]' },
  cancelled_by_platform: { label: 'Cancelled',              color: 'text-[hsl(var(--destructive))]', bg: 'bg-[hsl(var(--destructive)_/_8%)]' },
  no_show:               { label: 'No show',                color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--muted))]' },
}

/* ── Helpers ─────────────────────────────────────────────── */

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function InfoRow({ label, value, icon: Icon }: {
  label: string; value: string; icon?: React.ElementType
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[hsl(var(--border))] last:border-0">
      <span className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] min-w-[120px]">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {label}
      </span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */

export default function HostBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = use(params)
  const router = useRouter()

  const [booking,       setBooking]       = useState<BookingDetail | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [rejectReason,  setRejectReason]  = useState('')
  const [showReject,    setShowReject]    = useState(false)

  const fetchBooking = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}`)
      const json = await res.json() as { success: boolean; data?: BookingDetail; error?: { message: string } }
      if (!res.ok || !json.success) { setFetchError(json.error?.message ?? 'Booking not found'); return }
      setBooking(json.data!)
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => { void fetchBooking() }, [fetchBooking])

  const handleApprove = async () => {
    setActionLoading('approve'); setActionError(null)
    try {
      const res = await fetch('/api/v1/bookings/host', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action: 'approve' }),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) { setActionError(json.error?.message ?? 'Approval failed'); return }
      await fetchBooking()
    } finally { setActionLoading(null) }
  }

  const handleReject = async () => {
    setActionLoading('reject'); setActionError(null)
    try {
      const res = await fetch('/api/v1/bookings/host', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action: 'reject', reason: rejectReason || undefined }),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) { setActionError(json.error?.message ?? 'Rejection failed'); return }
      setShowReject(false)
      await fetchBooking()
    } finally { setActionLoading(null) }
  }

  /* ── Loading / error ───────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
      </div>
    )
  }

  if (fetchError || !booking) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{fetchError ?? 'Booking not found.'}</p>
        <Link href="/host/bookings" className="text-sm font-medium text-[hsl(var(--primary))]">
          ← Back to bookings
        </Link>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[booking.status] ?? { label: booking.status, color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--muted))]' }
  const isPending   = booking.status === 'pending'
  const isCompleted = booking.status === 'completed'
  const isActive    = booking.status === 'active'
  const showAccessCode = ['confirmed', 'active', 'completed'].includes(booking.status)

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">

      {/* Back */}
      <Link
        href="/host/bookings"
        className="mb-5 flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to bookings
      </Link>

      {/* Status banner */}
      <div className={cn('mb-6 flex items-center gap-3 rounded-[6px] px-4 py-3', cfg.bg)}>
        <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
        {isActive && <span className="ml-auto flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400"><Zap className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" /> Session in progress</span>}
      </div>

      {/* Action error */}
      {actionError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {actionError}
        </div>
      )}

      {/* Listing + schedule */}
      <section className="mb-5 rounded-[6px] border border-[hsl(var(--border))] p-5" aria-label="Booking details">
        <h1 className="mb-4 text-base font-semibold">
          {booking.listingTitle ?? 'Unknown listing'}
          {booking.listingCity && <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">· {booking.listingCity}</span>}
        </h1>
        <div className="px-0">
          <InfoRow icon={CalendarDays} label="Start"      value={fmtDateFull(booking.scheduledStart)} />
          <InfoRow icon={Clock}        label="Duration"   value={fmtDuration(booking.durationMinutes)} />
          <InfoRow icon={PoundSterling}label="Est. value" value={`£${(booking.estimatedCostPence / 100).toFixed(2)}`} />
          <InfoRow icon={Zap}          label="Pricing"    value={booking.pricingModel.replace(/_/g, ' ')} />
          <InfoRow icon={Shield}       label="Access"     value={booking.accessType.replace(/_/g, ' ')} />
          <InfoRow icon={MapPin}       label="Booked"     value={new Date(booking.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />
        </div>
      </section>

      {/* Access codes — shown to host after confirmation */}
      {showAccessCode && (booking.driverArrivalCode || booking.sessionPin) && (
        <section className="mb-5 rounded-[6px] border border-[hsl(var(--border))] p-5" aria-label="Access codes">
          <h2 className="mb-3 text-sm font-semibold">Access codes</h2>
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Share these with the driver if needed, or verify them on arrival.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {booking.driverArrivalCode && (
              <div className="rounded-[6px] bg-[hsl(var(--muted))] p-3 text-center">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Arrival code</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em]" aria-label={`Arrival code: ${booking.driverArrivalCode}`}>
                  {booking.driverArrivalCode}
                </p>
              </div>
            )}
            {booking.sessionPin && (
              <div className="rounded-[6px] bg-[hsl(var(--muted))] p-3 text-center">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Session PIN</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em]" aria-label={`Session PIN: ${booking.sessionPin}`}>
                  {booking.sessionPin}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Session summary — completed bookings */}
      {isCompleted && (
        <section className="mb-5 rounded-[6px] border border-[hsl(var(--primary)_/_20%)] bg-[hsl(var(--primary)_/_5%)] p-5" aria-label="Session summary">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
            <BatteryCharging className="h-4 w-4" aria-hidden="true" />
            Session completed
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Completed {booking.completedAt ? new Date(booking.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}.
            Earnings will appear in your next weekly payout.
          </p>
        </section>
      )}

      {/* Cancellation reason */}
      {booking.cancellationReason && (
        <section className="mb-5 rounded-[6px] border border-[hsl(var(--border))] p-4" aria-label="Cancellation details">
          <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Cancellation reason</p>
          <p className="mt-1 text-sm">{booking.cancellationReason}</p>
        </section>
      )}

      {/* Approve / Reject actions */}
      {isPending && (
        <section className="space-y-3" aria-label="Booking actions">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            This listing requires manual approval. Please approve or decline within 24 hours.
          </p>

          {!showReject ? (
            <div className="flex gap-3">
              <button
                onClick={() => { void handleApprove() }}
                disabled={actionLoading !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {actionLoading === 'approve'
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <CheckCircle className="h-4 w-4" aria-hidden="true" />}
                Approve booking
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={actionLoading !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--destructive)_/_40%)] py-3 text-sm font-semibold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)_/_5%)] disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Decline
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-[6px] border border-[hsl(var(--border))] p-4">
              <p className="text-sm font-medium">Reason for declining (optional)</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. The dates overlap with a personal trip. Please rebook for a different time."
                className="w-full resize-none rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { void handleReject() }}
                  disabled={actionLoading !== null}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--destructive))] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {actionLoading === 'reject'
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <XCircle className="h-4 w-4" aria-hidden="true" />}
                  Confirm decline
                </button>
                <button
                  onClick={() => { setShowReject(false); setRejectReason('') }}
                  className="rounded-[6px] border border-[hsl(var(--border))] px-4 py-2.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Active session link */}
      {isActive && (
        <div className="mt-4 rounded-[6px] border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            A charging session is in progress at this listing.
          </p>
          <Link href="/sessions" className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
            View session details →
          </Link>
        </div>
      )}

      {/* Stripe PI reference — for dispute resolution */}
      {booking.stripePaymentIntentId && isCompleted && (
        <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
          Payment reference: <code className="font-mono">{booking.stripePaymentIntentId}</code>
        </p>
      )}
    </div>
  )
}
