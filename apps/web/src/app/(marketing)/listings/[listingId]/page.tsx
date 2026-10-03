/**
 * @file page.tsx
 * @description /listings/[listingId] — Public listing detail page.
 * Server Component: fetches real listing data from /api/v1/listings/[id].
 * Renders gallery, specs, pricing, host card, reviews, and book CTA.
 *
 * @module apps/web/app/(marketing)/listings/[listingId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  MapPin, Zap, PoundSterling, Clock, Shield,
  Wifi, Car, Star, CheckCircle2, CalendarDays,
  BatteryCharging, Plug,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/* ── Types ───────────────────────────────────────────────── */

type ListingDetail = {
  id: string
  title: string
  description: string | null
  city: string
  postcode: string
  latitude: number
  longitude: number
  status: string
  chargerLevel: string
  plugTypes: string[]
  maxPowerKw: number
  chargerBrand: string | null
  chargerModel: string | null
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
  evParkingOnly: boolean
  averageRating: number | null
  reviewCount: number
  totalKwhDelivered: number
  hostName: string | null
  hostAvatarUrl: string | null
  hostMemberSince: string | null
  photos: Array<{ id: string; url: string; isCover: boolean }>
}

type ReviewItem = {
  id: string
  rating: number
  comment: string | null
  reviewerName: string | null
  createdAt: string
}

/* ── Data fetching ───────────────────────────────────────── */

async function getListing(listingId: string): Promise<ListingDetail | null> {
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/v1/listings/${listingId}`, {
      next: { revalidate: 60 }, // revalidate every 60s
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data: ListingDetail }
    return data.data
  } catch {
    return null
  }
}

async function getReviews(listingId: string): Promise<ReviewItem[]> {
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/v1/reviews?listingId=${listingId}&pageSize=5`, {
      next: { revalidate: 120 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { data: ReviewItem[] }
    return Array.isArray(data.data) ? data.data : []
  } catch {
    return []
  }
}

/* ── Metadata ────────────────────────────────────────────── */

type Props = { params: Promise<{ listingId: string }> }

/** SEO/Open Graph metadata for a public listing. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { listingId } = await params
  const listing = await getListing(listingId)
  if (!listing) return { title: 'Listing not found — Zipgrid' }

  const priceLabel = listing.pricePerKwhPence
    ? `${listing.pricePerKwhPence}p/kWh`
    : listing.pricePerHourPence
      ? `${(listing.pricePerHourPence / 100).toFixed(2)}/hr`
      : null

  return {
    title: `${listing.title} — Zipgrid`,
    description: `${listing.maxPowerKw}kW charger in ${listing.city}${priceLabel ? ` · ${priceLabel}` : ''}. Book instantly on Zipgrid.`,
    openGraph: {
      title: listing.title,
      description: `EV charger in ${listing.city} · ${listing.maxPowerKw}kW`,
      images: listing.photos[0] ? [{ url: listing.photos[0].url }] : [],
    },
  }
}

/* ── Components ──────────────────────────────────────────── */

function SpecRow({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] py-3 last:border-0">
      <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
      <span className="min-w-[140px] text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

const CHARGER_LEVEL_LABELS: Record<string, string> = {
  level_1: 'Level 1 (slow AC)',
  level_2: 'Level 2 (fast AC)',
  dc_fast: 'DC Fast Charge',
  dc_ultra_fast: 'DC Ultra-fast',
}

const ACCESS_TYPE_LABELS: Record<string, string> = {
  always_open: 'Always open',
  gate_code: 'Gate code (shown after booking)',
  buzz_in: 'Buzz in / intercom',
  key_pickup: 'Key pickup',
  app_unlock: 'App unlock (OCPP)',
}

function formatPrice(listing: ListingDetail): string {
  if (listing.pricingModel === 'per_kwh' && listing.pricePerKwhPence) {
    return `${listing.pricePerKwhPence}p per kWh`
  }
  if (listing.pricingModel === 'per_hour' && listing.pricePerHourPence) {
    return `£${(listing.pricePerHourPence / 100).toFixed(2)} per hour`
  }
  if (listing.pricingModel === 'per_session' && listing.pricePerSessionPence) {
    return `£${(listing.pricePerSessionPence / 100).toFixed(2)} per session`
  }
  return 'Contact host for pricing'
}

/* ── Page ────────────────────────────────────────────────── */

/** Page at /listings/[listingId] — Public listing detail page. */
export default async function ListingDetailPage({ params }: Props) {
  const { listingId } = await params
  const [listing, reviews] = await Promise.all([
    getListing(listingId),
    getReviews(listingId),
  ])

  if (!listing || listing.status !== 'active') notFound()

  const coverPhoto = listing.photos.find((p) => p.isCover) ?? listing.photos[0] ?? null
  const galleryPhotos = listing.photos.filter((p) => !p.isCover).slice(0, 2)
  const priceFormatted = formatPrice(listing)

  return (
    <>
      {/* ── PHOTO GALLERY ──────────────────────────────────── */}
      <section
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
        aria-label="Listing photos"
      >
        <div className="mx-auto grid h-72 max-w-7xl grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-3 sm:px-6 lg:h-80 lg:px-8">
          {/* Cover */}
          <div className="relative col-span-2 overflow-hidden rounded-[6px]">
            {coverPhoto ? (
              <Image
                src={coverPhoto.url}
                alt={listing.title}
                fill
                sizes="(max-width: 640px) 100vw, 66vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[hsl(var(--border)_/_50%)]">
                <div className="flex flex-col items-center gap-2 text-[hsl(var(--muted-foreground))]">
                  <Zap className="h-8 w-8" strokeWidth={1} aria-hidden="true" />
                  <p className="text-xs">{listing.chargerBrand ?? ''} {listing.chargerModel ?? ''}</p>
                </div>
              </div>
            )}
          </div>
          {/* Gallery thumbnails */}
          <div className="hidden flex-col gap-2 sm:flex">
            {[0, 1].map((idx) => {
              const photo = galleryPhotos[idx]
              return (
                <div key={idx} className="relative flex-1 overflow-hidden rounded-[6px]">
                  {photo ? (
                    <Image
                      src={photo.url}
                      alt={`${listing.title} — photo ${idx + 2}`}
                      fill
                      sizes="33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full bg-[hsl(var(--border)_/_40%)]" aria-hidden="true" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── MAIN CONTENT ────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-3">

          {/* ── LEFT: listing info ──────────────────────────── */}
          <div className="flex flex-col gap-8 lg:col-span-2">

            {/* Title + badges */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {listing.instantBookEnabled && (
                  <span className="rounded-full border border-[hsl(var(--primary)_/_30%)] bg-[hsl(var(--primary)_/_8%)] px-2.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                    Instant Book
                  </span>
                )}
                <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                  {CHARGER_LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel}
                </span>
                <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                  {listing.maxPowerKw} kW
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>

              <div className="flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--muted-foreground))]">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {listing.city}, {listing.postcode}
                </span>
                {listing.averageRating && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                    <strong className="font-medium text-[hsl(var(--foreground))]">
                      {listing.averageRating.toFixed(1)}
                    </strong>
                    <span>({listing.reviewCount} reviews)</span>
                  </span>
                )}
                {listing.totalKwhDelivered > 0 && (
                  <span className="flex items-center gap-1">
                    <BatteryCharging className="h-3.5 w-3.5" aria-hidden="true" />
                    {listing.totalKwhDelivered.toFixed(0)} kWh delivered
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {listing.description && (
              <div>
                <h2 className="mb-2 text-base font-semibold">About this charger</h2>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {listing.description}
                </p>
              </div>
            )}

            {/* Charger specs */}
            <div>
              <h2 className="mb-3 text-base font-semibold">Charger specs</h2>
              <div className="rounded-[6px] border border-[hsl(var(--border))] px-4">
                <SpecRow
                  label="Charger"
                  value={[listing.chargerBrand, listing.chargerModel].filter(Boolean).join(' ') || 'Not specified'}
                  icon={Zap}
                />
                <SpecRow label="Level"       value={CHARGER_LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel} icon={BatteryCharging} />
                <SpecRow label="Max power"   value={`${listing.maxPowerKw} kW`}                            icon={Zap} />
                <SpecRow label="Connectors"  value={listing.plugTypes.join(', ') || 'Not specified'}        icon={Plug} />
                <SpecRow label="Access"      value={ACCESS_TYPE_LABELS[listing.accessType] ?? listing.accessType} icon={Shield} />
                {listing.wifiAvailable    && <SpecRow label="Wi-Fi"         value="Available"   icon={Wifi} />}
                {listing.evParkingOnly    && <SpecRow label="Parking"       value="EV-only bay" icon={Car} />}
                {listing.shelterAvailable && <SpecRow label="Shelter"       value="Covered"     icon={Shield} />}
              </div>
            </div>

            {/* Amenities */}
            {(listing.wifiAvailable || listing.restroomAvailable || listing.shelterAvailable || listing.lightingAvailable || listing.evParkingOnly) && (
              <div>
                <h2 className="mb-3 text-base font-semibold">Amenities</h2>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { flag: listing.wifiAvailable,      label: 'Wi-Fi' },
                    { flag: listing.restroomAvailable,  label: 'Restroom nearby' },
                    { flag: listing.shelterAvailable,   label: 'Sheltered parking' },
                    { flag: listing.lightingAvailable,  label: 'Good lighting' },
                    { flag: listing.evParkingOnly,      label: 'EV-only bay' },
                  ].filter(({ flag }) => flag).map(({ label }) => (
                    <li key={label} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reviews */}
            <div>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                Reviews
                {listing.averageRating && (
                  <span className="flex items-center gap-1 text-sm font-normal text-[hsl(var(--muted-foreground))]">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {listing.averageRating.toFixed(1)} · {listing.reviewCount} reviews
                  </span>
                )}
              </h2>

              {reviews.length === 0 ? (
                <div className="rounded-[6px] border border-dashed border-[hsl(var(--border))] py-8 text-center">
                  <Star className="mx-auto h-6 w-6 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No reviews yet — be the first!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-[6px] border border-[hsl(var(--border))] p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{review.reviewerName ?? 'Driver'}</span>
                        <div className="flex items-center gap-0.5" aria-label={`${review.rating} stars`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                'h-3 w-3',
                                i < review.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-[hsl(var(--border))]',
                              )}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-[hsl(var(--muted-foreground))]">{review.comment}</p>
                      )}
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground)_/_60%)]">
                        {new Date(review.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: booking card ─────────────────────────── */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
              {/* Price */}
              <div className="mb-4 flex items-baseline gap-1">
                <span className="text-2xl font-bold">{priceFormatted.split(' ')[0]}</span>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                  {priceFormatted.split(' ').slice(1).join(' ')}
                </span>
              </div>
              {listing.idleFeePerMinPence > 0 && (
                <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
                  + {listing.idleFeePerMinPence}p/min idle fee after 10 min
                </p>
              )}

              {/* CTA */}
              <Link
                href={`/register?redirect=/listings/${listing.id}/book`}
                className="flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))] text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {listing.instantBookEnabled ? 'Book instantly' : 'Request booking'}
              </Link>

              {listing.instantBookEnabled && (
                <p className="mt-2 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  No approval wait — your booking is confirmed immediately.
                </p>
              )}

              {/* Features */}
              <ul className="mt-5 space-y-2">
                {[
                  { icon: CalendarDays, text: 'Book up to 90 days in advance' },
                  { icon: Shield,      text: 'Covered by Zipgrid Host Guarantee' },
                  { icon: Clock,       text: 'Free cancellation up to 24 hours before' },
                  { icon: PoundSterling, text: 'Pay securely via Stripe' },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>

              {/* Host card */}
              <div className="mt-5 border-t border-[hsl(var(--border))] pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--primary)_/_15%)] text-sm font-bold text-[hsl(var(--primary))]">
                    {listing.hostName ? listing.hostName.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{listing.hostName ?? 'Host'}</p>
                    {listing.hostMemberSince && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Member since {listing.hostMemberSince}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Map link */}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              View on Google Maps (approximate location)
            </a>
          </aside>

        </div>
      </div>
    </>
  )
}
