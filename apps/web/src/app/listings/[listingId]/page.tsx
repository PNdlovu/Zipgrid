/**
 * @file page.tsx
 * @description /listings/[listingId] — Public charger listing detail page.
 * Shows charger info, photos, amenities, host info, pricing, availability
 * summary, and a prominent "Book now" CTA that links to the booking flow.
 *
 * This page is public (no auth required to view). The "Book now" button
 * redirects unauthenticated users to /login?redirect=... via middleware.
 *
 * @module apps/web/app/listings/[listingId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MapPin, Zap, Star, Clock, PoundSterling,
  Wifi, ShieldCheck, Sun, Accessibility, Car, Loader2,
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  CalendarDays, Info, Plug,
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
}

type WeekDay = {
  dayOfWeek: string
  openTime: string
  closeTime: string
  isAvailable: boolean
}

type ListingReview = {
  id: string
  overallRating: number
  comment: string | null
  reviewerName: string | null
  ratingAccuracy: number | null
  ratingReliability: number | null
  ratingLocation: number | null
  ratingValue: number | null
  ratingCommunication: number | null
  createdAt: string
}

/* ── Constants ──────────────────────────────────────────────── */

const LEVEL_LABELS: Record<string, string> = {
  level_1:       'Level 1 — Slow (up to 3.7 kW)',
  level_2:       'Level 2 — Fast AC (7–22 kW)',
  dc_fast:       'DC Fast (50–150 kW)',
  dc_ultra_fast: 'DC Ultra-fast (150 kW+)',
}

const ACCESS_LABELS: Record<string, string> = {
  always_open: 'Always open',
  gate_code:   'Gate code (provided after booking)',
  buzz_in:     'Buzz in / intercom',
  key_pickup:  'Key pickup',
  app_unlock:  'App unlock (smart charger)',
}

const PLUG_LABELS: Record<string, string> = {
  type_2:   'Type 2',
  ccs_2:    'CCS 2',
  chademo:  'CHAdeMO',
  nacs:     'NACS',
  type_1:   'Type 1',
  three_pin:'3-pin (slow)',
}

const DAY_ORDER = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]
const DAY_SHORT: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function priceSummary(listing: ListingDetail): string {
  switch (listing.pricingModel) {
    case 'per_kwh':
      return listing.pricePerKwhPence !== null
        ? `${formatPence(listing.pricePerKwhPence)}/kWh`
        : 'Price on request'
    case 'per_hour':
      return listing.pricePerHourPence !== null
        ? `${formatPence(listing.pricePerHourPence)}/hr`
        : 'Price on request'
    case 'per_session':
      return listing.pricePerSessionPence !== null
        ? `${formatPence(listing.pricePerSessionPence)} flat`
        : 'Price on request'
    case 'hybrid':
      return listing.pricePerSessionPence !== null && listing.pricePerKwhPence !== null
        ? `${formatPence(listing.pricePerSessionPence)} + ${formatPence(listing.pricePerKwhPence)}/kWh`
        : 'See pricing details'
    default:
      return 'See pricing details'
  }
}

function todayDayOfWeek(): string {
  return new Date()
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase()
}

/* ── Sub-components ─────────────────────────────────────────── */

function PhotoGallery({ photos, title }: { photos: ListingDetail['photos']; title: string }) {
  const [idx, setIdx] = useState(0)

  if (photos.length === 0) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-[8px] bg-[hsl(var(--muted))] md:h-72">
        <Zap className="h-12 w-12 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" />
      </div>
    )
  }

  const cover = photos.find((p) => p.isCover) ?? photos[0]!
  const sorted = [cover, ...photos.filter((p) => p.id !== cover.id)]

  return (
    <div className="relative overflow-hidden rounded-[8px] bg-[hsl(var(--muted))]">
      {/* Main image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sorted[idx]!.url}
        alt={`${title} — photo ${idx + 1} of ${sorted.length}`}
        className="h-56 w-full object-cover md:h-72"
      />

      {/* Navigation arrows */}
      {sorted.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + sorted.length) % sorted.length)}
            disabled={idx === 0}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm disabled:opacity-30 hover:bg-black/60"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % sorted.length)}
            disabled={idx === sorted.length - 1}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm disabled:opacity-30 hover:bg-black/60"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden="true">
            {sorted.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-all',
                  i === idx ? 'bg-white w-3' : 'bg-white/50',
                )}
              />
            ))}
          </div>
        </>
      )}

      {/* Count badge */}
      {sorted.length > 1 && (
        <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {idx + 1}/{sorted.length}
        </span>
      )}
    </div>
  )
}

function AmenityBadge({ icon: Icon, label, active }: {
  icon: React.ElementType
  label: string
  active: boolean
}) {
  if (!active) return null
  return (
    <div className="flex items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'h-3.5 w-3.5',
            n <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-[hsl(var(--border))]',
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function WeeklyScheduleWidget({ schedule }: { schedule: WeekDay[] }) {
  const today = todayDayOfWeek()
  const sorted = DAY_ORDER.map(
    (d) => schedule.find((s) => s.dayOfWeek === d) ?? { dayOfWeek: d, openTime: '', closeTime: '', isAvailable: false },
  )

  if (sorted.every((d) => !d.isAvailable)) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">No regular availability set — contact host.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Weekly availability">
        <tbody>
          {sorted.map((day) => (
            <tr
              key={day.dayOfWeek}
              className={cn(
                'border-b border-[hsl(var(--border)/0.5)] last:border-0',
                day.dayOfWeek === today && 'font-semibold',
              )}
            >
              <td className="py-1.5 pr-4 text-[hsl(var(--muted-foreground))]">
                {DAY_SHORT[day.dayOfWeek]}
                {day.dayOfWeek === today && (
                  <span className="ml-1.5 rounded-full bg-[hsl(var(--primary))] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Today
                  </span>
                )}
              </td>
              <td className="py-1.5">
                {day.isAvailable
                  ? `${day.openTime} – ${day.closeTime}`
                  : <span className="text-[hsl(var(--muted-foreground))]">Closed</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = use(params)
  const router = useRouter()

  const [listing, setListing] = useState<ListingDetail | null>(null)
  const [schedule, setSchedule] = useState<WeekDay[]>([])
  const [reviews, setReviews] = useState<ListingReview[]>([])
  const [reviewTotal, setReviewTotal] = useState(0)
  const [reviewsPage, setReviewsPage] = useState(1)
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchListing = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/listings/${listingId}`)
      if (res.status === 404) {
        setError('Charger not found.')
        return
      }
      if (!res.ok) throw new Error('Failed to load listing')
      const json = (await res.json()) as { data: ListingDetail }
      setListing(json.data)
    } catch {
      setError('Could not load this charger. Please try again.')
    }
  }, [listingId])

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/listings/${listingId}/schedule`)
      if (res.ok) {
        const json = (await res.json()) as { data: WeekDay[] }
        setSchedule(json.data ?? [])
      }
    } catch {
      // Non-critical — page renders fine without schedule
    }
  }, [listingId])

  const fetchReviews = useCallback(async (page: number) => {
    try {
      const res = await fetch(
        `/api/v1/reviews?listingId=${listingId}&page=${page}&pageSize=5`,
      )
      if (res.ok) {
        const json = (await res.json()) as {
          data: { reviews: ListingReview[]; total: number }
          meta: { total: number }
        }
        const incoming = json.data.reviews ?? []
        setReviewTotal(json.data.total)
        setReviews((prev) => (page === 1 ? incoming : [...prev, ...incoming]))
      }
    } catch { /* non-critical */ }
  }, [listingId])

  useEffect(() => {
    setLoading(true)
    void Promise.all([fetchListing(), fetchSchedule(), fetchReviews(1)]).finally(() => setLoading(false))
  }, [fetchListing, fetchSchedule, fetchReviews])

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading listing" />
      </div>
    )
  }

  /* ── Error ── */
  if (error || !listing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-[hsl(var(--destructive))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {error ?? 'Listing not available.'}
        </p>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--primary))]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Go back
        </button>
      </div>
    )
  }

  const isActive = listing.status === 'active'

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/0.9)] px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="rounded-full p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="flex-1 truncate text-sm font-semibold">{listing.title}</span>
        {listing.averageRating !== null && (
          <span className="flex items-center gap-1 text-sm font-medium">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            {listing.averageRating.toFixed(1)}
          </span>
        )}
      </header>

      <main id="main-content" className="mx-auto max-w-2xl px-4 pb-32 pt-4">
        {/* ── Photo gallery ── */}
        <PhotoGallery photos={listing.photos} title={listing.title} />

        {/* ── Title + location ── */}
        <div className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold leading-tight tracking-tight">{listing.title}</h1>
            {listing.instantBookEnabled && (
              <span className="mt-0.5 shrink-0 rounded-full bg-[hsl(var(--primary)/0.1)] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--primary))]">
                Instant book
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {listing.addressLine1}, {listing.city}, {listing.postcode}
            </span>
            {listing.averageRating !== null && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                <span className="font-medium text-[hsl(var(--foreground))]">
                  {listing.averageRating.toFixed(1)}
                </span>
                <span>({listing.reviewCount} {listing.reviewCount === 1 ? 'review' : 'reviews'})</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Status warning (inactive listings) ── */}
        {!isActive && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-[6px] bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300"
          >
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            This charger is temporarily unavailable for bookings.
          </div>
        )}

        {/* ── Quick stats strip ── */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-center">
            <Zap className="mb-1 h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Max power</span>
            <span className="mt-0.5 text-sm font-semibold">{listing.maxPowerKw} kW</span>
          </div>
          <div className="flex flex-col items-center rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-center">
            <PoundSterling className="mb-1 h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Pricing</span>
            <span className="mt-0.5 text-sm font-semibold">{priceSummary(listing)}</span>
          </div>
          <div className="flex flex-col items-center rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-center">
            <Clock className="mb-1 h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Session</span>
            <span className="mt-0.5 text-sm font-semibold">
              {listing.minBookingHours}–{listing.maxBookingHours}h
            </span>
          </div>
        </div>

        {/* ── About ── */}
        {listing.description && (
          <section className="mt-6" aria-labelledby="about-heading">
            <h2 id="about-heading" className="mb-2 text-base font-semibold">About</h2>
            <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              {listing.description}
            </p>
          </section>
        )}

        {/* ── Charger specs ── */}
        <section className="mt-6" aria-labelledby="specs-heading">
          <h2 id="specs-heading" className="mb-3 text-base font-semibold">Charger specs</h2>
          <dl className="grid gap-2 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 sm:col-span-1">
              <dt className="text-[hsl(var(--muted-foreground))]">Type</dt>
              <dd className="font-medium text-right">
                {LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[hsl(var(--muted-foreground))]">Max power</dt>
              <dd className="font-medium">{listing.maxPowerKw} kW</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[hsl(var(--muted-foreground))]">Ports</dt>
              <dd className="font-medium">{listing.numPorts}</dd>
            </div>
            {(listing.chargerBrand ?? listing.chargerModel) && (
              <div className="flex justify-between gap-2">
                <dt className="text-[hsl(var(--muted-foreground))]">Hardware</dt>
                <dd className="font-medium text-right">
                  {[listing.chargerBrand, listing.chargerModel].filter(Boolean).join(' ')}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-[hsl(var(--muted-foreground))]">Access</dt>
              <dd className="font-medium text-right">
                {ACCESS_LABELS[listing.accessType] ?? listing.accessType}
              </dd>
            </div>
            {listing.isSmartCharger && (
              <div className="flex justify-between gap-2">
                <dt className="text-[hsl(var(--muted-foreground))]">Smart control</dt>
                <dd className="flex items-center gap-1 font-medium text-[hsl(var(--primary))]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  OCPP enabled
                </dd>
              </div>
            )}
            {listing.idleFeePerMinPence > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-[hsl(var(--muted-foreground))]">Idle fee</dt>
                <dd className="font-medium">{formatPence(listing.idleFeePerMinPence)}/min</dd>
              </div>
            )}
          </dl>
        </section>

        {/* ── Plug types ── */}
        {listing.plugTypes.length > 0 && (
          <section className="mt-6" aria-labelledby="plugs-heading">
            <h2 id="plugs-heading" className="mb-3 text-base font-semibold">Plug types</h2>
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
          </section>
        )}

        {/* ── Amenities ── */}
        <section className="mt-6" aria-labelledby="amenities-heading">
          <h2 id="amenities-heading" className="mb-3 text-base font-semibold">Amenities</h2>
          {[
            listing.wifiAvailable,
            listing.restroomAvailable,
            listing.shelterAvailable,
            listing.lightingAvailable,
            listing.wheelchairAccessible,
            listing.evParkingOnly,
          ].some(Boolean) ? (
            <div className="flex flex-wrap gap-2">
              <AmenityBadge icon={Wifi}          label="WiFi available"           active={listing.wifiAvailable} />
              <AmenityBadge icon={ShieldCheck}   label="Restroom nearby"          active={listing.restroomAvailable} />
              <AmenityBadge icon={Sun}           label="Covered parking"          active={listing.shelterAvailable} />
              <AmenityBadge icon={Star}          label="Good lighting"            active={listing.lightingAvailable} />
              <AmenityBadge icon={Accessibility} label="Wheelchair accessible"    active={listing.wheelchairAccessible} />
              <AmenityBadge icon={Car}           label="EV-only parking"          active={listing.evParkingOnly} />
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No amenities listed.</p>
          )}
        </section>

        {/* ── Availability schedule ── */}
        {schedule.length > 0 && (
          <section className="mt-6" aria-labelledby="availability-heading">
            <h2 id="availability-heading" className="mb-3 flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Availability
            </h2>
            <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <WeeklyScheduleWidget schedule={schedule} />
              <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                Actual availability may differ due to bookings or blocked dates.
              </p>
            </div>
          </section>
        )}

        {/* ── Map link ── */}
        <section className="mt-6" aria-labelledby="location-heading">
          <h2 id="location-heading" className="mb-3 text-base font-semibold">Location</h2>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm hover:bg-[hsl(var(--secondary))]"
            aria-label={`Open ${listing.addressLine1} in Google Maps`}
          >
            <MapPin className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
            <div>
              <p className="font-medium">{listing.addressLine1}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {listing.city}, {listing.postcode}
              </p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          </a>
        </section>

        {/* ── Stats footer ── */}
        {listing.totalKwhDelivered > 0 && (
          <p className="mt-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
            <span className="font-semibold text-[hsl(var(--foreground))]">
              {listing.totalKwhDelivered.toFixed(0)} kWh
            </span>{' '}
            delivered across all sessions at this charger.
          </p>
        )}

        {/* ── Reviews ── */}
        <section className="mt-6" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            Reviews
            {listing.reviewCount > 0 && (
              <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
                ({listing.reviewCount})
              </span>
            )}
          </h2>

          {reviews.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[hsl(var(--border))] p-6 text-center">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No reviews yet. Be the first to charge here and leave a review.
              </p>
            </div>
          ) : (
            <>
              <ul className="space-y-4" role="list">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
                  >
                    {/* Reviewer + overall */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {review.reviewerName ?? 'Verified driver'}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {new Date(review.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </p>
                      </div>
                      <ReviewStars rating={review.overallRating} />
                    </div>

                    {/* Comment */}
                    {review.comment && (
                      <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--foreground))]">
                        {review.comment}
                      </p>
                    )}

                    {/* Sub-ratings */}
                    {[
                      ['Accuracy',      review.ratingAccuracy],
                      ['Reliability',   review.ratingReliability],
                      ['Location',      review.ratingLocation],
                      ['Value',         review.ratingValue],
                      ['Communication', review.ratingCommunication],
                    ].filter(([, v]) => v != null).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {([
                          ['Accuracy',      review.ratingAccuracy],
                          ['Reliability',   review.ratingReliability],
                          ['Location',      review.ratingLocation],
                          ['Value',         review.ratingValue],
                          ['Communication', review.ratingCommunication],
                        ] as [string, number | null][]).filter(([, v]) => v != null).map(([label, val]) => (
                          <span
                            key={label}
                            className="flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs"
                          >
                            <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
                            <span className="font-semibold">{val}/5</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Load more */}
              {reviews.length < reviewTotal && (
                <button
                  type="button"
                  onClick={async () => {
                    const nextPage = reviewsPage + 1
                    setLoadingMoreReviews(true)
                    await fetchReviews(nextPage)
                    setReviewsPage(nextPage)
                    setLoadingMoreReviews(false)
                  }}
                  disabled={loadingMoreReviews}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] disabled:opacity-60"
                >
                  {loadingMoreReviews
                    ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</>
                    : `Show more (${reviewTotal - reviews.length} remaining)`
                  }
                </button>
              )}
            </>
          )}
        </section>
      </main>

      {/* ── Sticky book CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/0.95)] px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          {/* Price preview */}
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-bold">{priceSummary(listing)}</p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              {listing.instantBookEnabled ? 'Instant booking' : 'Awaits host approval'}{' '}
              · {listing.minBookingHours}–{listing.maxBookingHours}h session
            </p>
          </div>

          {isActive ? (
            <Link
              href={`/listings/${listingId}/book`}
              className="flex shrink-0 items-center gap-2 rounded-[8px] bg-[hsl(var(--primary))] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-transform"
            >
              Book now
            </Link>
          ) : (
            <button
              disabled
              className="flex shrink-0 items-center gap-2 rounded-[8px] bg-[hsl(var(--muted))] px-6 py-3 text-sm font-semibold text-[hsl(var(--muted-foreground))] cursor-not-allowed"
            >
              Unavailable
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
