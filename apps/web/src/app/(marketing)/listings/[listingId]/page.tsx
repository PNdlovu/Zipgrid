/**
 * @file page.tsx
 * @description /listings/[listingId] — Public listing detail page.
 * Gallery, specs, pricing, host card, reviews, availability, book CTA.
 * Server Component for SEO + fast first paint.
 *
 * @module apps/web/app/(marketing)/listings/[listingId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MapPin, Zap, PoundSterling, Clock, Shield,
  Wifi, Car, Star, CheckCircle2, CalendarDays, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = { params: Promise<{ listingId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { listingId } = await params
  return {
    title: `Charger Listing ${listingId} — Zipgrid`,
    description: 'Find and book this EV charger on Zipgrid.',
  }
}

import type { LucideIcon } from 'lucide-react'

/** Renders a spec row */
function SpecRow({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[hsl(var(--border))] last:border-0">
      <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
      <span className="text-sm text-[hsl(var(--muted-foreground))] min-w-[120px]">{label}</span>
      <span className="text-sm font-medium text-[hsl(var(--foreground))]">{value}</span>
    </div>
  )
}

/**
 * Listing detail page — public, SEO-indexed, no auth required.
 */
export default async function ListingDetailPage({ params }: Props) {
  const { listingId } = await params

  // In production: fetch from /api/v1/listings/[id] with server-side fetch
  // Shown with demo structure — real data when DB is connected
  const listing = {
    id: listingId,
    title: 'Fast Level 2 in Quiet Earlsfield Driveway',
    description: 'My driveway is easy to find — look for the green gate. Street parking available nearby. Café 3 minutes\' walk.',
    city: 'London',
    postcode: 'SW18 1AA',
    chargerLevel: 'level_2',
    maxPowerKw: 7.4,
    chargerBrand: 'EO Charging',
    chargerModel: 'EO Mini Pro 3',
    plugTypes: ['Type 2'],
    pricingModel: 'per_kwh',
    pricePerKwhPence: 35,
    idleFeePerMinPence: 10,
    instantBookEnabled: true,
    accessType: 'gate_code',
    wifiAvailable: true,
    shelterAvailable: false,
    evParkingOnly: true,
    averageRating: 4.9,
    reviewCount: 23,
    status: 'active',
  }

  const host = {
    displayName: 'Sarah C.',
    initials: 'SC',
    isSuperhost: true,
    responseRate: 98,
    memberSince: '2025',
  }

  return (
    <>
      {/* ── PHOTO GALLERY ────────────────────────────────────────── */}
      <section
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
        aria-label="Listing photos"
      >
        <div className="mx-auto grid h-72 max-w-7xl grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-3 sm:px-6 lg:px-8 lg:h-80">
          {/* Cover photo placeholder */}
          <div className="col-span-2 flex items-center justify-center rounded-[6px] bg-[hsl(var(--border)/0.5)]">
            <div className="flex flex-col items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Zap className="h-8 w-8" strokeWidth={1} aria-hidden="true" />
              <p className="text-xs">{listing.chargerBrand} · {listing.chargerModel}</p>
            </div>
          </div>
          <div className="hidden flex-col gap-2 sm:flex">
            {[1, 2].map((i) => (
              <div key={i} className="flex flex-1 items-center justify-center rounded-[6px] bg-[hsl(var(--border)/0.4)]" aria-hidden="true" />
            ))}
          </div>
        </div>
      </section>

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Left: listing info */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {/* Title + badges */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {listing.instantBookEnabled && (
                  <span className="rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] px-2.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                    Instant Book
                  </span>
                )}
                <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-2.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">
                  Level 2 · {listing.maxPowerKw}kW
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-3xl">
                {listing.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {listing.city}, {listing.postcode}
                </span>
                {listing.averageRating && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={0} />
                    <strong className="text-[hsl(var(--foreground))]">{listing.averageRating}</strong>
                    ({listing.reviewCount} reviews)
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {listing.description && (
              <section aria-label="About this listing">
                <p className="leading-relaxed text-[hsl(var(--muted-foreground))]">{listing.description}</p>
              </section>
            )}

            {/* Charger specs */}
            <section aria-label="Charger specifications" className="flex flex-col">
              <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">Charger specs</h2>
              <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5">
                <SpecRow label="Brand & model" value={`${listing.chargerBrand} ${listing.chargerModel}`} icon={Zap} />
                <SpecRow label="Max power" value={`${listing.maxPowerKw}kW`} icon={Zap} />
                <SpecRow label="Plug types" value={listing.plugTypes.join(', ')} icon={Zap} />
                <SpecRow label="Access" value={listing.accessType.replace('_', ' ')} icon={Shield} />
                {listing.wifiAvailable && <SpecRow label="Wi-Fi" value="Available" icon={Wifi} />}
                {listing.evParkingOnly && <SpecRow label="Parking" value="EV-only bay" icon={Car} />}
              </div>
            </section>

            {/* Pricing */}
            <section aria-label="Pricing">
              <h2 className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]">Pricing</h2>
              <div className="flex flex-wrap gap-4">
                {listing.pricePerKwhPence != null && (
                  <div className="flex flex-col gap-1 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">Per kWh</span>
                    <span className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">
                      £{(listing.pricePerKwhPence / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Idle fee</span>
                  <span className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">
                    {listing.idleFeePerMinPence}p/min
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                Idle fee applies if your car remains plugged in after your session ends.
                A 15% platform service fee is added at checkout.
              </p>
            </section>

            {/* Reviews */}
            <section aria-label="Reviews">
              <h2 className="mb-4 text-lg font-semibold text-[hsl(var(--foreground))]">
                Reviews
                {listing.averageRating && (
                  <span className="ml-3 text-base font-normal text-[hsl(var(--muted-foreground))]">
                    ★ {listing.averageRating} · {listing.reviewCount} reviews
                  </span>
                )}
              </h2>
              {/* Empty state — real reviews from DB in Module C Phase 2 */}
              <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-5 py-8 text-center">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Reviews load after your first booking.</p>
              </div>
            </section>
          </div>

          {/* Right: booking card */}
          <div className="lg:col-span-1">
            <div className={cn(
              'sticky top-20 flex flex-col gap-5 rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--card))] p-6 shadow-sm',
            )}>
              {/* Price */}
              <div className="flex items-baseline gap-1">
                {listing.pricePerKwhPence != null
                  ? <><span className="font-mono text-3xl font-bold text-[hsl(var(--foreground))]">£{(listing.pricePerKwhPence / 100).toFixed(2)}</span><span className="text-sm text-[hsl(var(--muted-foreground))]">/kWh</span></>
                  : <span className="text-lg font-semibold text-[hsl(var(--foreground))]">Contact host for pricing</span>
                }
              </div>

              {listing.averageRating && (
                <div className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={0} />
                  <strong>{listing.averageRating}</strong>
                  <span className="text-[hsl(var(--muted-foreground))]">({listing.reviewCount} reviews)</span>
                </div>
              )}

              {/* Book CTA */}
              <Link
                href={`/auth/register?redirect=/listings/${listing.id}/book`}
                className={cn(
                  'flex h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                  'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                )}
              >
                {listing.instantBookEnabled ? 'Book instantly' : 'Request to book'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
                You won&apos;t be charged until your session starts
              </p>

              {/* Feature list */}
              <div className="flex flex-col gap-2 border-t border-[hsl(var(--border))] pt-4">
                {[
                  listing.instantBookEnabled ? 'Instant Book — no waiting for approval' : 'Host approval required within 24h',
                  'Free cancellation up to 24h before',
                  '£1M Host Protection on every session',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                    {item}
                  </div>
                ))}
              </div>

              {/* Host card */}
              <div className="flex items-center gap-3 border-t border-[hsl(var(--border))] pt-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-sm font-semibold text-[hsl(var(--foreground))]" aria-hidden="true">
                  {host.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Hosted by {host.displayName}
                    {host.isSuperhost && (
                      <span className="ml-2 text-[10px] font-semibold text-[hsl(var(--primary))]">★ Superhost</span>
                    )}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {host.responseRate}% response rate · Member since {host.memberSince}
                  </p>
                </div>
              </div>

              {/* Availability */}
              <div className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--secondary))] px-4 py-3 text-sm">
                <CalendarDays className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                <span className="text-[hsl(var(--muted-foreground))]">Availability calendar loads after signing in</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
