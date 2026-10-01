/**
 * @file ListingCard.tsx
 * @description Reusable listing card used in map sidebar, search results, and browse grids.
 * Links to /listings/[id] for the public detail page.
 * @module components/listing
 */

import Link from 'next/link'
import { MapPin, Zap, Star, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ListingCardData = {
  id: string
  title: string
  city: string
  maxPowerKw: number
  chargerLevel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  pricingModel: string
  instantBookEnabled: boolean
  averageRating: number | null
  reviewCount: number
  distanceMetres?: number
  photos?: Array<{ url: string; isCover: boolean }>
}

type ListingCardProps = {
  listing: ListingCardData
  /** Compact horizontal layout for map sidebars */
  compact?: boolean
  className?: string
}

function formatPrice(listing: ListingCardData): string {
  switch (listing.pricingModel) {
    case 'per_kwh':    return listing.pricePerKwhPence    != null ? `${listing.pricePerKwhPence}p/kWh`                 : '—'
    case 'per_hour':   return listing.pricePerHourPence   != null ? `£${(listing.pricePerHourPence / 100).toFixed(2)}/hr` : '—'
    case 'per_session':return listing.pricePerSessionPence != null ? `£${(listing.pricePerSessionPence / 100).toFixed(2)}` : '—'
    case 'hybrid':
      if (listing.pricePerSessionPence != null && listing.pricePerKwhPence != null)
        return `£${(listing.pricePerSessionPence / 100).toFixed(2)} + ${listing.pricePerKwhPence}p/kWh`
      return '—'
    default: return '—'
  }
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

const LEVEL_LABELS: Record<string, string> = {
  level_1:       'Level 1',
  level_2:       'Level 2',
  dc_fast:       'DC Fast',
  dc_ultra_fast: 'DC Ultra-fast',
}

/** Listing card — links to public listing detail. */
export function ListingCard({ listing, compact = false, className }: ListingCardProps) {
  const coverPhoto = listing.photos?.find((p) => p.isCover) ?? listing.photos?.[0]

  if (compact) {
    return (
      <Link
        href={`/listings/${listing.id}`}
        className={cn(
          'flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
          'px-3 py-2.5 transition-colors hover:border-[hsl(var(--primary)/0.4)]',
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
            {listing.title}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-0.5">
              <Zap className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
              {listing.maxPowerKw}kW
            </span>
            <span className="font-mono">{formatPrice(listing)}</span>
            {listing.distanceMetres != null && (
              <span>{formatDistance(listing.distanceMetres)}</span>
            )}
          </div>
        </div>
        {listing.averageRating != null && (
          <div className="flex shrink-0 items-center gap-0.5 text-xs">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            <span className="font-semibold text-[hsl(var(--foreground))]">
              {listing.averageRating.toFixed(1)}
            </span>
          </div>
        )}
      </Link>
    )
  }

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={cn(
        'flex flex-col overflow-hidden rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
        'transition-all hover:border-[hsl(var(--primary)/0.4)] hover:shadow-sm',
        className,
      )}
    >
      {/* Photo */}
      <div className="relative h-40 bg-[hsl(var(--muted))]">
        {coverPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverPhoto.url}
            alt={listing.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Zap className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.3)]" aria-hidden="true" strokeWidth={1} />
          </div>
        )}
        {listing.instantBookEnabled && (
          <span className="absolute right-2 top-2 rounded-full bg-[hsl(var(--primary))] px-2 py-0.5 text-[10px] font-semibold text-white">
            Instant
          </span>
        )}
        {listing.distanceMetres != null && (
          <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {formatDistance(listing.distanceMetres)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[hsl(var(--foreground))]">
          {listing.title}
        </p>

        <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{listing.city}</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-0.5">
              <Zap className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
              {listing.maxPowerKw}kW
            </span>
            <span>{LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel}</span>
          </div>

          <div className="flex items-center gap-2">
            {listing.averageRating != null && (
              <span className="flex items-center gap-0.5 text-xs">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                <span className="font-semibold text-[hsl(var(--foreground))]">
                  {listing.averageRating.toFixed(1)}
                </span>
              </span>
            )}
            <span className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">
              {formatPrice(listing)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
