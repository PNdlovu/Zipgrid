/**
 * @file page.tsx
 * @description /driver/bookings/[bookingId] — Booking detail.
 * Shows: status, schedule, host info, QR/PIN codes (confirmed only),
 * access instructions (confirmed only), Start session CTA, Cancel button.
 *
 * @module apps/web/app/(driver)/bookings/[bookingId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MapPin, CalendarDays, Clock, PoundSterling,
  Zap, Navigation, Copy, CheckCircle2, AlertCircle,
  AlertTriangle, Loader2, X, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeaveReviewModal } from '@/components/reviews/LeaveReviewModal'

/* ── Types ──────────────────────────────────────────────────── */

type BookingDetail = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  durationMinutes: number
  estimatedCostPence: number
  pricingModel: string
  accessType: string
  accessInstructions: string | null
  instantBook: boolean
  driverArrivalCode: string | null
  sessionPin: string | null
  confirmedAt: string | null
  listingId: string | null
  listingTitle: string | null
  listingCity: string | null
  listingLatitude: number | null
  listingLongitude: number | null
  hostName: string | null
  cancellationReason: string | null
  /** OCPP charge point ID linked to this listing — used to start remote session */
  ocppChargePointId: string | null
}

/* ── Status config ───────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Awaiting confirmation', color: 'text-yellow-600', bg: 'bg-yellow-500/10' },
  confirmed: {
    label: 'Confirmed',
    color: 'text-[hsl(var(--primary))]',
    bg: 'bg-[hsl(var(--primary)/0.1)]',
  },
  active: { label: 'Session active', color: 'text-[hsl(var(--primary))]', bg: 'bg-[hsl(var(--primary)/0.1)]' },
  completed: { label: 'Completed', color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
  cancelled_by_driver: {
    label: 'Cancelled by you',
    color: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.08)]',
  },
  cancelled_by_host: {
    label: 'Cancelled by host',
    color: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.08)]',
  },
  cancelled_by_platform: {
    label: 'Cancelled',
    color: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.08)]',
  },
  no_show: { label: 'No show', color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
}

const FALLBACK_STATUS = {
  label: 'Unknown',
  color: 'text-[hsl(var(--muted-foreground))]',
  bg: 'bg-[hsl(var(--secondary))]',
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`
}

function buildMapsUrl(lat: number, lng: number, label: string): string {
  const encoded = encodeURIComponent(label)
  // Deep-link: tries Apple Maps on iOS, Google Maps everywhere else
  if (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    return `maps://maps.apple.com/?q=${encoded}&ll=${lat},${lng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/* ── Copy button ─────────────────────────────────────────────── */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available — silent fail
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : `Copy ${label}`}
      className="flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/* ── Cancel modal ────────────────────────────────────────────── */

function CancelModal({
  bookingId,
  onConfirm,
  onClose,
  loading,
  error,
}: {
  bookingId: string
  onConfirm: (reason: string) => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  const [reason, setReason] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div className="w-full max-w-sm rounded-t-[12px] bg-[hsl(var(--background))] p-6 sm:rounded-[12px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="cancel-modal-title" className="font-semibold text-[hsl(var(--foreground))]">
            Cancel booking?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          The authorization hold will be released. This cannot be undone.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          maxLength={500}
          className={cn(
            'mb-4 w-full resize-none rounded-[6px] border border-[hsl(var(--border))]',
            'bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))]',
            'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
          )}
        />
        {error && (
          <p role="alert" className="mb-3 text-sm text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-[6px] border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--foreground))] disabled:opacity-50"
          >
            Keep booking
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={loading}
            aria-busy={loading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-[6px] py-2.5 text-sm font-semibold',
              'bg-[hsl(var(--destructive))] text-white disabled:opacity-50',
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Cancel booking
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = use(params)
  const router = useRouter()

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const [startingSession, setStartingSession] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const [showReview, setShowReview] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)

  const fetchBooking = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}`)
      const json = await res.json() as {
        success: boolean
        data?: BookingDetail
        error?: { message: string }
      }
      if (!res.ok || !json.success) {
        setFetchError(json.error?.message ?? 'Booking not found')
        return
      }
      setBooking(json.data!)
      // Check if this user has already reviewed this booking
      if (json.data?.status === 'completed') {
        void fetch(`/api/v1/reviews?bookingId=${json.data.id}`)
          .then((r) => r.json())
          .then((d: { data?: { reviewed?: boolean } }) => {
            setHasReviewed(d.data?.reviewed ?? false)
          })
          .catch(() => { /* non-critical */ })
      }
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    void fetchBooking()
  }, [fetchBooking])

  const handleCancel = async (reason: string) => {
    setCancelling(true)
    setCancelError(null)
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason }),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setCancelError(json.error?.message ?? 'Cancellation failed. Please try again.')
        return
      }
      setShowCancel(false)
      await fetchBooking()
    } finally {
      setCancelling(false)
    }
  }

  const handleStartSession = async () => {
    if (!booking) return
    setStartingSession(true)
    setStartError(null)
    try {
      const res = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          // Use the listing's OCPP chargePointId; server also resolves it from DB as fallback
          chargePointId: booking.ocppChargePointId ?? '',
          connectorId: 1,
        }),
      })
      const json = await res.json() as {
        success: boolean
        data?: { sessionId: string }
        error?: { message: string }
      }
      if (!res.ok || !json.success) {
        setStartError(json.error?.message ?? 'Could not start session. Please try again.')
        return
      }
      router.push(`/driver/session/${json.data!.sessionId}`)
    } finally {
      setStartingSession(false)
    }
  }

  /* ── Loading / error states ───────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2
          className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]"
          aria-label="Loading booking"
        />
      </div>
    )
  }

  if (fetchError || !booking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {fetchError ?? 'Booking not found.'}
        </p>
        <Link
          href="/driver/bookings"
          className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
        >
          Back to bookings
        </Link>
      </div>
    )
  }

  /* ── Derived state ────────────────────────────────────────── */

  const cfg = STATUS_CONFIG[booking.status] ?? FALLBACK_STATUS
  const isConfirmed = booking.status === 'confirmed'
  const isPending = booking.status === 'pending'
  const isActive = booking.status === 'active'
  const isCompleted = booking.status === 'completed'
  const isCancellable = ['pending', 'confirmed'].includes(booking.status)
  const isStartable = isConfirmed && new Date(booking.scheduledStart) <= new Date(Date.now() + 30 * 60_000)
  const costPounds = (booking.estimatedCostPence / 100).toFixed(2)
  const mapsUrl =
    booking.listingLatitude && booking.listingLongitude
      ? buildMapsUrl(booking.listingLatitude, booking.listingLongitude, booking.listingTitle ?? 'Charger')
      : null

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
          <Link
            href="/driver/bookings"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
            aria-label="Back to bookings"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
              {booking.listingTitle ?? 'Booking'}
            </p>
            {booking.listingCity && (
              <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {booking.listingCity}
              </div>
            )}
          </div>
          {/* Status badge */}
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              cfg.bg,
              cfg.color,
            )}
          >
            {cfg.label}
          </span>
        </header>

        <main className="flex-1 px-5 py-6">
          <div className="mx-auto flex max-w-lg flex-col gap-5">

            {/* Schedule card */}
            <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Schedule
              </p>
              <div className="flex flex-col gap-2.5 text-sm">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  <span className="text-[hsl(var(--foreground))]">{formatFull(booking.scheduledStart)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  <span className="text-[hsl(var(--foreground))]">
                    {formatTimeOnly(booking.scheduledStart)} – {formatTimeOnly(booking.scheduledEnd)}
                    {' '}
                    <span className="text-[hsl(var(--muted-foreground))]">
                      ({formatDuration(booking.durationMinutes)})
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <PoundSterling className="h-4 w-4 flex-shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  <span className="text-[hsl(var(--foreground))]">
                    Estimated <span className="font-semibold">£{costPounds}</span>{' '}
                    <span className="text-[hsl(var(--muted-foreground))]">(final on session end)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* QR / PIN — confirmed bookings only */}
            {(isConfirmed || isActive) && booking.sessionPin && (
              <div className="rounded-[8px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                  Arrival PIN
                </p>
                <div className="flex items-center justify-between">
                  <span
                    className="font-mono text-4xl font-bold tracking-[0.3em] text-[hsl(var(--foreground))]"
                    aria-label={`Arrival PIN: ${booking.sessionPin.split('').join(' ')}`}
                  >
                    {booking.sessionPin}
                  </span>
                  <CopyButton value={booking.sessionPin} label="PIN" />
                </div>
                {booking.driverArrivalCode && (
                  <div className="mt-3 border-t border-[hsl(var(--primary)/0.15)] pt-3">
                    <p className="mb-1 text-xs text-[hsl(var(--muted-foreground))]">QR code ID</p>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-[hsl(var(--foreground))]">
                        {booking.driverArrivalCode}
                      </span>
                      <CopyButton value={booking.driverArrivalCode} label="QR code ID" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Access instructions — confirmed only */}
            {(isConfirmed || isActive) && booking.accessInstructions && (
              <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Access instructions
                </p>
                <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]">
                  {booking.accessInstructions}
                </p>
              </div>
            )}

            {/* Pending message */}
            {isPending && (
              <div className="flex items-start gap-3 rounded-[8px] border border-yellow-500/30 bg-yellow-500/8 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium text-[hsl(var(--foreground))]">Waiting for host confirmation</p>
                  <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">
                    The host will confirm or decline within 24 hours. PIN will appear once confirmed.
                  </p>
                </div>
              </div>
            )}

            {/* Host */}
            {booking.hostName && (
              <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Host
                </p>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">{booking.hostName}</p>
              </div>
            )}

            {/* Navigate button */}
            {mapsUrl && (isConfirmed || isPending) && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-[6px]',
                  'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm font-medium',
                  'text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]',
                )}
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
                Navigate to charger
              </a>
            )}

            {/* Start session error */}
            {startError && (
              <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {startError}
              </p>
            )}

            {/* Start session CTA */}
            {isStartable && (
              <button
                type="button"
                onClick={handleStartSession}
                disabled={startingSession}
                aria-busy={startingSession}
                className={cn(
                  'flex h-13 items-center justify-center gap-2 rounded-[6px]',
                  'bg-[hsl(var(--primary))] text-base font-semibold text-[hsl(var(--primary-foreground))]',
                  'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {startingSession ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Starting…
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
                    Start charging
                  </>
                )}
              </button>
            )}

            {/* Go to active session */}
            {isActive && (
              <Link
                href="/driver/session"
                className={cn(
                  'flex h-13 items-center justify-center gap-2 rounded-[6px]',
                  'bg-[hsl(var(--primary))] text-base font-semibold text-[hsl(var(--primary-foreground))]',
                  'transition-opacity hover:opacity-90',
                )}
              >
                <Zap className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
                View active session
              </Link>
            )}

            {/* Cancel button */}
            {isCancellable && (
              <button
                type="button"
                onClick={() => {
                  setCancelError(null)
                  setShowCancel(true)
                }}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-[6px]',
                  'border border-[hsl(var(--destructive)/0.4)] text-sm font-medium',
                  'text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/0.06)]',
                )}
              >
                Cancel booking
              </button>
            )}

            {/* Leave a review — completed bookings only */}
            {isCompleted && !hasReviewed && (
              <button
                type="button"
                onClick={() => setShowReview(true)}
                className={cn(
                  'flex h-11 items-center justify-center gap-2 rounded-[6px]',
                  'border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.06)] text-sm font-medium',
                  'text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/0.1)]',
                )}
              >
                <Star className="h-4 w-4" aria-hidden="true" />
                Leave a review
              </button>
            )}
            {isCompleted && hasReviewed && (
              <p className="flex items-center justify-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))]">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                You reviewed this session
              </p>
            )}

            {/* Booking ref */}
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
              Booking ref:{' '}
              <span className="font-mono font-semibold">
                {booking.id.slice(0, 8).toUpperCase()}
              </span>
            </p>
          </div>
        </main>
      </div>

      {/* Cancel modal */}
      {showCancel && (
        <CancelModal
          bookingId={bookingId}
          onConfirm={handleCancel}
          onClose={() => setShowCancel(false)}
          loading={cancelling}
          error={cancelError}
        />
      )}

      {showReview && booking && (
        <LeaveReviewModal
          bookingId={booking.id}
          listingId={booking.listingId ?? ''}
          listingTitle={booking.listingTitle ?? 'Charger session'}
          onClose={() => setShowReview(false)}
          onSubmitted={() => setHasReviewed(true)}
        />
      )}
    </>
  )
}
