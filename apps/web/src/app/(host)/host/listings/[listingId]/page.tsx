/**
 * @file page.tsx
 * @description /host/listings/[listingId] — Host listing detail / overview page.
 * Shows: status, key stats (sessions, revenue, kWh, rating), quick actions
 * (edit, publish/pause, preview), recent bookings, and a photo thumbnail.
 *
 * This is the read-only host view that the listing list links to.
 * All editing happens on /host/listings/[listingId]/edit.
 *
 * @module apps/web/app/(host)/listings/[listingId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Edit, Eye, PlayCircle, PauseCircle,
  MapPin, Zap, PoundSterling, Star, CalendarDays,
  BarChart3, Clock, CheckCircle2, AlertTriangle,
  Loader2, ChevronRight, Plug, Wifi, Car,
  ShieldCheck, Sun, Accessibility,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ListingDetail = {
  id: string
  title: string
  description: string | null
  status: string
  addressLine1: string
  city: string
  postcode: string
  latitude: number
  longitude: number
  chargerLevel: string
  plugTypes: string[]
  maxPowerKw: number
  numPorts: number
  chargerBrand: string | null
  chargerModel: string | null
  ocppChargePointId: string | null
  isSmartCharger: boolean
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinPence: number
  instantBookEnabled: boolean
  accessType: string
  wifiAvailable: boolean
  restroomAvailable: boolean
  shelterAvailable: boolean
  lightingAvailable: boolean
  wheelchairAccessible: boolean
  evParkingOnly: boolean
  minBookingHours: number
  maxBookingHours: number
  averageRating: number | null
  reviewCount: number
  totalKwhDelivered: number
  photos: Array<{ id: string; url: string; isCover: boolean }>
  createdAt: string
}

type BookingRow = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  estimatedCostPence: number
  driverName: string | null
}

/* ── Constants ──────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:       { label: 'Live',         color: 'text-[hsl(var(--primary))]',        bg: 'bg-[hsl(var(--primary)/0.08)]',         border: 'border-[hsl(var(--primary)/0.3)]' },
  draft:        { label: 'Draft',        color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]',           border: 'border-[hsl(var(--border))]' },
  paused:       { label: 'Paused',       color: 'text-yellow-600',                   bg: 'bg-yellow-500/10',                      border: 'border-yellow-400/30' },
  under_review: { label: 'Under review', color: 'text-blue-600',                     bg: 'bg-blue-500/10',                        border: 'border-blue-400/30' },
  deactivated:  { label: 'Deactivated',  color: 'text-[hsl(var(--destructive))]',    bg: 'bg-[hsl(var(--destructive)/0.08)]',     border: 'border-[hsl(var(--destructive)/0.3)]' },
}

const FALLBACK_STATUS = STATUS_CONFIG['draft']!

const BOOKING_STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  pending:   { label: 'Pending',   dot: 'bg-yellow-400' },
  confirmed: { label: 'Confirmed', dot: 'bg-[hsl(var(--primary))]' },
  active:    { label: 'Active',    dot: 'bg-[hsl(var(--primary))]' },
  completed: { label: 'Completed', dot: 'bg-[hsl(var(--muted-foreground))]' },
  cancelled_by_driver: { label: 'Cancelled', dot: 'bg-[hsl(var(--destructive))]' },
  cancelled_by_host:   { label: 'Cancelled', dot: 'bg-[hsl(var(--destructive))]' },
}

const LEVEL_LABELS: Record<string, string> = {
  level_1:       'Level 1',
  level_2:       'Level 2',
  dc_fast:       'DC Fast',
  dc_ultra_fast: 'DC Ultra-fast',
}

const PLUG_LABELS: Record<string, string> = {
  type_2: 'Type 2', ccs_2: 'CCS 2', chademo: 'CHAdeMO', nacs: 'NACS',
}

const ACCESS_LABELS: Record<string, string> = {
  always_open: 'Always open',
  gate_code:   'Gate code',
  buzz_in:     'Buzz in / intercom',
  key_pickup:  'Key pickup',
  app_unlock:  'App unlock (OCPP)',
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatPence(p: number) {
  return `£${(p / 100).toFixed(2)}`
}

function priceSummary(l: ListingDetail): string {
  switch (l.pricingModel) {
    case 'per_kwh':    return l.pricePerKwhPence    != null ? `${formatPence(l.pricePerKwhPence)}/kWh`    : '—'
    case 'per_hour':   return l.pricePerHourPence   != null ? `${formatPence(l.pricePerHourPence)}/hr`    : '—'
    case 'per_session':return l.pricePerSessionPence!= null ? `${formatPence(l.pricePerSessionPence)} flat`: '—'
    case 'hybrid':
      if (l.pricePerSessionPence != null && l.pricePerKwhPence != null)
        return `${formatPence(l.pricePerSessionPence)} + ${formatPence(l.pricePerKwhPence)}/kWh`
      return '—'
    default: return '—'
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /host/listings/[listingId] — Host listing detail / overview page. */
export default function HostListingDetailPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = use(params)
  const router = useRouter()

  const [listing, setListing] = useState<ListingDetail | null>(null)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchListing = useCallback(async () => {
    const res = await fetch(`/api/v1/listings/${listingId}`)
    if (res.status === 404) { setError('Listing not found.'); return }
    if (!res.ok) throw new Error('Failed to load listing')
    const json = (await res.json()) as { data: ListingDetail }
    setListing(json.data)
  }, [listingId])

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/bookings/host?listingId=${listingId}&pageSize=5`)
      if (res.ok) {
        const json = (await res.json()) as { data: BookingRow[] }
        setBookings(json.data ?? [])
      }
    } catch { /* non-critical */ }
  }, [listingId])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchListing(), fetchBookings()])
      .catch(() => setError('Could not load listing.'))
      .finally(() => setLoading(false))
  }, [fetchListing, fetchBookings])

  const handleAction = async (action: 'publish' | 'pause') => {
    if (!listing) return
    setActionLoading(action)
    try {
      if (action === 'publish') {
        await fetch(`/api/v1/listings/${listingId}/publish`, { method: 'POST' })
      } else {
        await fetch(`/api/v1/listings/${listingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paused' }),
        })
      }
      await fetchListing()
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
      </div>
    )
  }

  /* ── Error ── */
  if (error || !listing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-[hsl(var(--destructive))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{error ?? 'Listing not found.'}</p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--primary))]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to listings
        </button>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[listing.status] ?? FALLBACK_STATUS
  const coverPhoto = listing.photos.find((p) => p.isCover) ?? listing.photos[0]

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-4">
        <Link
          href="/host/listings"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to listings"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>

        <div className="flex flex-1 flex-wrap items-start gap-3">
          {/* Cover thumbnail */}
          {coverPhoto && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverPhoto.url}
              alt={`${listing.title} cover`}
              className="h-14 w-20 shrink-0 rounded-[6px] object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[hsl(var(--foreground))] leading-tight">
                {listing.title}
              </h1>
              <span className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                statusCfg.bg, statusCfg.border, statusCfg.color,
              )}>
                {statusCfg.label}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {listing.addressLine1}, {listing.city}, {listing.postcode}
            </p>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              Listed {fmtDate(listing.createdAt)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/listings/${listingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-3 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview
          </Link>
          <Link
            href={`/host/listings/${listingId}/edit`}
            className="flex h-9 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-3 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
          >
            <Edit className="h-4 w-4" aria-hidden="true" />
            Edit
          </Link>
          {(listing.status === 'draft' || listing.status === 'paused') && (
            <button
              onClick={() => { void handleAction('publish') }}
              disabled={actionLoading === 'publish'}
              className="flex h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {actionLoading === 'publish'
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <PlayCircle className="h-4 w-4" aria-hidden="true" />
              }
              {listing.status === 'paused' ? 'Resume' : 'Publish'}
            </button>
          )}
          {listing.status === 'active' && (
            <button
              onClick={() => { void handleAction('pause') }}
              disabled={actionLoading === 'pause'}
              className="flex h-9 items-center gap-2 rounded-[6px] border border-yellow-400/40 bg-yellow-500/10 px-3 text-sm font-semibold text-yellow-700 disabled:opacity-60 dark:text-yellow-400"
            >
              {actionLoading === 'pause'
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <PauseCircle className="h-4 w-4" aria-hidden="true" />
              }
              Pause
            </button>
          )}
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            icon: PoundSterling,
            label: 'Pricing',
            value: priceSummary(listing),
          },
          {
            icon: Zap,
            label: 'Power',
            value: `${listing.maxPowerKw} kW · ${LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel}`,
          },
          {
            icon: Star,
            label: 'Rating',
            value: listing.averageRating !== null
              ? `${listing.averageRating.toFixed(1)} (${listing.reviewCount})`
              : 'No reviews yet',
          },
          {
            icon: BarChart3,
            label: 'Energy delivered',
            value: `${listing.totalKwhDelivered.toFixed(1)} kWh`,
          },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex flex-col gap-1.5 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
          >
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
              {label}
            </div>
            <p className="text-sm font-semibold text-[hsl(var(--foreground))] leading-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Charger details ── */}
        <section aria-labelledby="charger-details-heading" className="flex flex-col gap-4">
          <h2 id="charger-details-heading" className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Charger details
          </h2>

          <dl className="flex flex-col gap-2 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm">
            {[
              ['Charger level', LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel],
              ['Max power',     `${listing.maxPowerKw} kW`],
              ['Ports',         String(listing.numPorts)],
              listing.chargerBrand && ['Brand',  listing.chargerBrand],
              listing.chargerModel && ['Model',  listing.chargerModel],
              listing.ocppChargePointId && ['OCPP ID', listing.ocppChargePointId],
              ['Access',        ACCESS_LABELS[listing.accessType] ?? listing.accessType],
              ['Session',       `${listing.minBookingHours}–${listing.maxBookingHours}h`],
              ['Instant book',  listing.instantBookEnabled ? 'Yes' : 'No'],
            ].filter(Boolean).map((entry) => {
              const [label, val] = entry as [string, string]
              return (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="text-[hsl(var(--muted-foreground))]">{label}</dt>
                  <dd className="font-medium text-right max-w-[55%] break-all">{val}</dd>
                </div>
              )
            })}
          </dl>

          {/* Plug types */}
          {listing.plugTypes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Plug types</p>
              <div className="flex flex-wrap gap-2">
                {listing.plugTypes.map((p) => (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1 text-xs font-medium"
                  >
                    <Plug className="h-3 w-3" aria-hidden="true" />
                    {PLUG_LABELS[p] ?? p.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Amenities */}
          {[
            listing.wifiAvailable,
            listing.restroomAvailable,
            listing.shelterAvailable,
            listing.lightingAvailable,
            listing.wheelchairAccessible,
            listing.evParkingOnly,
          ].some(Boolean) && (
            <div>
              <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Amenities</p>
              <div className="flex flex-wrap gap-2">
                {listing.wifiAvailable          && <AmenityChip icon={Wifi}          label="WiFi" />}
                {listing.restroomAvailable      && <AmenityChip icon={ShieldCheck}   label="Restroom" />}
                {listing.shelterAvailable       && <AmenityChip icon={Sun}           label="Shelter" />}
                {listing.lightingAvailable      && <AmenityChip icon={Star}          label="Lighting" />}
                {listing.wheelchairAccessible   && <AmenityChip icon={Accessibility} label="Accessible" />}
                {listing.evParkingOnly          && <AmenityChip icon={Car}           label="EV-only bay" />}
              </div>
            </div>
          )}

          {/* Smart charger badge */}
          {listing.isSmartCharger && (
            <div className="flex items-center gap-2 rounded-[6px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-3 py-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              <span className="font-medium text-[hsl(var(--primary))]">OCPP smart charger</span>
              <span className="text-[hsl(var(--muted-foreground))]">— remote start/stop enabled</span>
            </div>
          )}
        </section>

        {/* ── Recent bookings ── */}
        <section aria-labelledby="recent-bookings-heading" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 id="recent-bookings-heading" className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Recent bookings
            </h2>
            <Link
              href={`/host/bookings?listingId=${listingId}`}
              className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
            >
              View all <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[8px] border border-dashed border-[hsl(var(--border))] p-8 text-center">
              <CalendarDays className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No bookings yet</p>
              {listing.status === 'draft' && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Publish this listing to start receiving bookings.
                </p>
              )}
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-2">
              {bookings.map((booking) => {
                const bCfg = BOOKING_STATUS_CONFIG[booking.status] ?? { label: booking.status, dot: 'bg-[hsl(var(--muted-foreground))]' }
                return (
                  <li key={booking.id}>
                    <Link
                      href={`/host/bookings/${booking.id}`}
                      className="flex items-center gap-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm hover:bg-[hsl(var(--secondary))] transition-colors"
                    >
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', bCfg.dot)} aria-hidden="true" />
                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        <span className="truncate font-medium">
                          {booking.driverName ?? 'Driver'}
                        </span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {fmtDate(booking.scheduledStart)} · {fmtTime(booking.scheduledStart)}
                          </span>
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-xs font-medium">{formatPence(booking.estimatedCostPence)}</span>
                        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{bCfg.label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Quick links */}
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Link
              href={`/host/listings/${listingId}/edit`}
              className="flex items-center justify-between rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-medium hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              <span className="flex items-center gap-2">
                <Edit className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                Edit listing
              </span>
              <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            </Link>
            <Link
              href={`/host/listings/${listingId}/edit#schedule`}
              className="flex items-center justify-between rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-medium hover:bg-[hsl(var(--secondary))] transition-colors"
            >
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                Manage availability
              </span>
              <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ── Tiny amenity chip ──────────────────────────────────────── */
function AmenityChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1 text-xs font-medium">
      <Icon className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
      {label}
    </span>
  )
}
