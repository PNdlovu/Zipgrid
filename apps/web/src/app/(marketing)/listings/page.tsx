/**
 * @file page.tsx
 * @description /listings — Public listings browse page.
 * Searchable, filterable grid of all active charger listings.
 * Calls /api/v1/listings/nearby with user's geolocation or postcode.
 * Falls back to a UK-wide grid view when no location is provided.
 *
 * Client Component so we can access geolocation + reactive filters.
 *
 * @module apps/web/app/(marketing)/listings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Search, MapPin, Zap, SlidersHorizontal, Star,
  BatteryCharging, Clock, CheckCircle, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type Listing = {
  id: string
  title: string
  city: string
  postcode: string
  latitude: number
  longitude: number
  chargerLevel: string
  maxPowerKw: number
  plugTypes: string[]
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  instantBookEnabled: boolean
  averageRating: number | null
  reviewCount: number
  distanceM: number
  coverPhotoUrl: string | null
}

type Filters = {
  postcode: string
  minPowerKw: string
  instantBook: boolean
  pricingModel: string
}

const DEFAULT_FILTERS: Filters = {
  postcode: '',
  minPowerKw: '',
  instantBook: false,
  pricingModel: '',
}

const CHARGER_LEVEL_LABELS: Record<string, string> = {
  level_1: 'Level 1',
  level_2: 'Level 2',
  dc_fast: 'DC Fast',
  dc_ultra_fast: 'Ultra-fast',
}

/* ── Helpers ─────────────────────────────────────────────── */

function formatPrice(listing: Listing): string {
  if (listing.pricePerKwhPence)    return `${listing.pricePerKwhPence}p/kWh`
  if (listing.pricePerHourPence)   return `£${(listing.pricePerHourPence   / 100).toFixed(2)}/hr`
  if (listing.pricePerSessionPence)return `£${(listing.pricePerSessionPence / 100).toFixed(2)} flat`
  return 'Contact host'
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres}m`
  return `${(metres / 1000).toFixed(1)}km`
}

/* ── Listing card ────────────────────────────────────────── */

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-shadow hover:shadow-md"
      aria-label={listing.title}
    >
      {/* Photo */}
      <div className="relative h-44 overflow-hidden bg-[hsl(var(--muted))]">
        {listing.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.coverPhotoUrl}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Zap className="h-8 w-8 text-[hsl(var(--muted-foreground)_/_40%)]" strokeWidth={1} aria-hidden="true" />
          </div>
        )}
        {listing.instantBookEnabled && (
          <span className="absolute left-3 top-3 rounded-full bg-[hsl(var(--primary))] px-2 py-0.5 text-[10px] font-bold text-white">
            Instant Book
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{listing.title}</h3>
          {listing.averageRating && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {listing.averageRating.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {listing.city}
            {listing.distanceM > 0 && ` · ${formatDistance(listing.distanceM)}`}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium">
              {CHARGER_LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel}
            </span>
            <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium">
              {listing.maxPowerKw}kW
            </span>
          </div>
          <span className="text-sm font-semibold text-[hsl(var(--primary))]">
            {formatPrice(listing)}
          </span>
        </div>
      </div>
    </Link>
  )
}

/* ── Skeleton card ───────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="h-44 bg-[hsl(var(--muted))]" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-[hsl(var(--muted))]" />
        <div className="h-3 w-1/2 rounded bg-[hsl(var(--muted))]" />
        <div className="h-3 w-1/3 rounded bg-[hsl(var(--muted))]" />
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────── */

export default function ListingsPage() {
  const [listings, setListings]     = useState<Listing[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [filters, setFilters]       = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle')
  const searchRef = useRef<HTMLInputElement>(null)
  const PAGE_SIZE = 20

  // Request geolocation on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      setLocationStatus('requesting')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setLocationStatus('granted')
        },
        () => setLocationStatus('denied'),
        { timeout: 5000, maximumAge: 300_000 },
      )
    } else {
      setLocationStatus('denied')
    }
  }, [])

  const fetchListings = useCallback(async (p = 1, reset = false) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        radiusKm: '25',
      })

      if (userCoords && !filters.postcode) {
        params.set('lat', String(userCoords.lat))
        params.set('lng', String(userCoords.lng))
      } else if (filters.postcode) {
        params.set('postcode', filters.postcode)
      } else {
        // Default: central London
        params.set('lat', '51.5074')
        params.set('lng', '-0.1278')
        params.set('radiusKm', '50')
      }

      if (filters.minPowerKw)   params.set('minPowerKw', filters.minPowerKw)
      if (filters.instantBook)  params.set('instantBook', 'true')
      if (filters.pricingModel) params.set('pricingModel', filters.pricingModel)

      const res = await fetch(`/api/v1/listings/nearby?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load listings')
      const data = (await res.json()) as { data: Listing[]; meta: { total: number } }

      setListings(reset || p === 1 ? data.data : (prev) => [...prev, ...data.data])
      setTotal(data.meta?.total ?? 0)
      setPage(p)
    } catch {
      setError('Could not load listings. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [userCoords, filters])

  // Refetch when location resolved or filters change
  useEffect(() => {
    if (locationStatus === 'requesting') return
    void fetchListings(1, true)
  }, [fetchListings, locationStatus])

  function handleFilterChange<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const hasMore = listings.length < total
  const activeFilterCount = [
    filters.minPowerKw, filters.instantBook, filters.pricingModel,
  ].filter(Boolean).length

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Find a charger</h1>
        <p className="mt-1 text-[hsl(var(--muted-foreground))]">
          {total > 0
            ? `${total} charger${total !== 1 ? 's' : ''} near you`
            : locationStatus === 'requesting'
              ? 'Finding chargers near you…'
              : 'Chargers across the UK'}
        </p>
      </div>

      {/* Search + filters bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Postcode search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={filters.postcode}
            onChange={(e) => handleFilterChange('postcode', e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && void fetchListings(1, true)}
            placeholder="Search by postcode, e.g. SW1A 1AA"
            className="h-11 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] pl-9 pr-4 text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
            aria-label="Search by postcode"
          />
          {filters.postcode && (
            <button
              onClick={() => { handleFilterChange('postcode', ''); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              aria-label="Clear postcode"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'flex h-11 items-center gap-2 rounded-[6px] border px-4 text-sm font-medium transition-colors',
            showFilters || activeFilterCount > 0
              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_8%)] text-[hsl(var(--primary))]'
              : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
          )}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Use my location */}
        {locationStatus === 'denied' || locationStatus === 'idle' ? (
          <button
            onClick={() => {
              setLocationStatus('requesting')
              navigator.geolocation.getCurrentPosition(
                (pos) => { setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationStatus('granted') },
                () => setLocationStatus('denied'),
              )
            }}
            className="flex h-11 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-3 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Near me
          </button>
        ) : locationStatus === 'granted' ? (
          <span className="flex items-center gap-1 text-xs text-[hsl(var(--primary))]">
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Using your location
          </span>
        ) : null}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--muted)_/_50%)] p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="minPower">Min power (kW)</label>
            <select
              id="minPower"
              value={filters.minPowerKw}
              onChange={(e) => handleFilterChange('minPowerKw', e.target.value)}
              className="h-9 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 text-sm"
            >
              <option value="">Any</option>
              <option value="3.6">3.6+ kW (standard)</option>
              <option value="7">7+ kW (fast)</option>
              <option value="22">22+ kW (rapid AC)</option>
              <option value="50">50+ kW (DC fast)</option>
              <option value="100">100+ kW (ultra-fast)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="pricingModel">Pricing</label>
            <select
              id="pricingModel"
              value={filters.pricingModel}
              onChange={(e) => handleFilterChange('pricingModel', e.target.value)}
              className="h-9 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 text-sm"
            >
              <option value="">Any</option>
              <option value="per_kwh">Per kWh</option>
              <option value="per_hour">Per hour</option>
              <option value="per_session">Flat rate</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={filters.instantBook}
              onChange={(e) => handleFilterChange('instantBook', e.target.checked)}
              className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
            />
            Instant Book only
          </label>
          <button
            onClick={() => { setFilters(DEFAULT_FILTERS); void fetchListings(1, true) }}
            className="self-end text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Results */}
      {error ? (
        <div role="alert" className="rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      ) : loading && listings.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-[hsl(var(--border))] py-16 text-center">
          <BatteryCharging className="mx-auto h-10 w-10 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No chargers found</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Try a different location or adjust your filters.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => { void fetchListings(page + 1) }}
                disabled={loading}
                className="flex items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-6 py-2.5 text-sm font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-50"
              >
                {loading ? (
                  <><Clock className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</>
                ) : (
                  `Load more (${total - listings.length} remaining)`
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* SEO footer link */}
      <div className="mt-12 border-t border-[hsl(var(--border))] pt-8 text-center">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Want to earn money from your home charger?{' '}
          <Link href="/for-homeowners" className="text-[hsl(var(--primary))] hover:underline">
            Become a host →
          </Link>
        </p>
      </div>
    </div>
  )
}
