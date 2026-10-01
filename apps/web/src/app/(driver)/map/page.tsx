/**
 * @file page.tsx
 * @description /map — Driver map search page.
 * Mapbox GL JS with listing clusters, filter panel, and listing cards.
 * Falls back to list view if WebGL is unavailable.
 *
 * @module apps/web/app/(driver)/map
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  MapPin, Filter, X, Zap, SlidersHorizontal,
  Star, PoundSterling, Clock, Navigation,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ListingCard = {
  id: string
  title: string
  city: string
  distanceMetres?: number
  maxPowerKw: number
  chargerLevel: string
  pricePerKwhPence: number | null
  instantBookEnabled: boolean
  averageRating: number | null
  reviewCount: number
  latitude: number
  longitude: number
}

type Filters = {
  plugTypes: string[]
  minPowerKw: number | null
  maxPricePence: number | null
  instantBookOnly: boolean
  availableNow: boolean
}

const DEFAULT_FILTERS: Filters = {
  plugTypes: [],
  minPowerKw: null,
  maxPricePence: null,
  instantBookOnly: false,
  availableNow: false,
}

const PLUG_OPTIONS = [
  { value: 'type_2', label: 'Type 2' },
  { value: 'ccs_2', label: 'CCS 2' },
  { value: 'chademo', label: 'CHAdeMO' },
  { value: 'nacs', label: 'NACS' },
]

/** Listing card for the sidebar list */
function ListingItem({ listing }: { listing: ListingCard }) {
  const distanceKm = listing.distanceMetres != null
    ? listing.distanceMetres < 1000
      ? `${Math.round(listing.distanceMetres)}m`
      : `${(listing.distanceMetres / 1000).toFixed(1)}km`
    : null

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={cn(
        'flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
        'p-4 transition-colors hover:border-[hsl(var(--primary)/0.4)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold leading-snug text-[hsl(var(--foreground))]">{listing.title}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{listing.city}</p>
        </div>
        {distanceKm && (
          <span className="shrink-0 rounded-[4px] bg-[hsl(var(--secondary))] px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
            {distanceKm}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
          {listing.maxPowerKw}kW
        </span>
        {listing.pricePerKwhPence != null && (
          <span className="flex items-center gap-1 font-mono">
            <PoundSterling className="h-3 w-3" aria-hidden="true" />
            {(listing.pricePerKwhPence / 100).toFixed(2)}/kWh
          </span>
        )}
        {listing.averageRating && (
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={0} />
            {listing.averageRating.toFixed(1)} ({listing.reviewCount})
          </span>
        )}
        {listing.instantBookEnabled && (
          <span className="flex items-center gap-1 text-[hsl(var(--primary))]">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Instant book
          </span>
        )}
      </div>
    </Link>
  )
}

/** Filter panel */
function FilterPanel({ filters, onChange, onClose }: {
  filters: Filters
  onChange: (f: Filters) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<Filters>(filters)

  const togglePlug = (v: string) => {
    setLocal((f) => ({
      ...f,
      plugTypes: f.plugTypes.includes(v) ? f.plugTypes.filter((p) => p !== v) : [...f.plugTypes, v],
    }))
  }

  return (
    <div className="flex flex-col gap-5 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Filters</span>
        <button type="button" onClick={onClose} aria-label="Close filters">
          <X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        </button>
      </div>

      {/* Plug types */}
      <fieldset>
        <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Plug type</legend>
        <div className="flex flex-wrap gap-2">
          {PLUG_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => togglePlug(value)}
              className={cn(
                'rounded-[6px] border px-3 py-1.5 text-xs font-medium transition-colors',
                local.plugTypes.includes(value)
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.4)]',
              )}
              aria-pressed={local.plugTypes.includes(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Toggles */}
      <div className="flex flex-col gap-3">
        {[
          { key: 'instantBookOnly', label: 'Instant Book only' },
          { key: 'availableNow', label: 'Available right now' },
        ].map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center justify-between">
            <span className="text-sm text-[hsl(var(--foreground))]">{label}</span>
            <input
              type="checkbox"
              checked={local[key as keyof Filters] as boolean}
              onChange={(e) => setLocal((f) => ({ ...f, [key]: e.target.checked }))}
              className="accent-[hsl(var(--primary))]"
            />
          </label>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS); onClose() }}
          className="flex-1 rounded-[6px] border border-[hsl(var(--border))] py-2 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => { onChange(local); onClose() }}
          className={cn(
            'flex-1 rounded-[6px] bg-[hsl(var(--primary))] py-2 text-sm',
            'font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
          )}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

/**
 * Map search page — Mapbox GL JS with listing clusters.
 */
export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [listings, setListings] = useState<ListingCard[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  // Get user location
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 51.5074, lng: -0.1278 }), // London fallback
      )
    } else {
      setUserLocation({ lat: 51.5074, lng: -0.1278 })
    }
  }, [])

  // Fetch listings
  const fetchListings = useCallback(async () => {
    if (!userLocation) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        lat: String(userLocation.lat),
        lng: String(userLocation.lng),
        radius: '10000',
        ...(filters.plugTypes.length ? { plugTypes: filters.plugTypes.join(',') } : {}),
        ...(filters.instantBookOnly ? { instantBookOnly: 'true' } : {}),
        pageSize: '50',
      })
      const res = await fetch(`/api/v1/listings?${params.toString()}`)
      if (res.ok) {
        const data = await res.json() as { success: boolean; data: ListingCard[] }
        if (data.success) setListings(data.data)
      }
    } finally {
      setLoading(false)
    }
  }, [userLocation, filters])

  useEffect(() => { void fetchListings() }, [fetchListings])

  // Initialise Mapbox
  useEffect(() => {
    if (!mapContainerRef.current || !userLocation || mapLoaded) return
    const mapboxToken = process.env['NEXT_PUBLIC_MAPBOX_TOKEN']
    if (!mapboxToken) { setMapLoaded(true); return }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = mapboxToken
      const map = new mapboxgl.Map({
        container: mapContainerRef.current!,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [userLocation.lng, userLocation.lat],
        zoom: 12,
      })
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')

      // Add charger pin layers on style load
      map.on('load', () => {
        // Cluster source — will be populated by the listings effect below
        map.addSource('chargers', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        })

        // Cluster circles
        map.addLayer({
          id: 'charger-clusters',
          type: 'circle',
          source: 'chargers',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#00C853',
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })

        // Cluster count labels
        map.addLayer({
          id: 'charger-cluster-count',
          type: 'symbol',
          source: 'chargers',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
          paint: { 'text-color': '#ffffff' },
        })

        // Individual charger pins
        map.addLayer({
          id: 'charger-pins',
          type: 'circle',
          source: 'chargers',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'case',
              ['==', ['get', 'instantBook'], true], '#00C853',
              '#1A73E8',
            ],
            'circle-radius': 10,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        })

        // Click on cluster → zoom in
        map.on('click', 'charger-clusters', (e) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const source = map.getSource('chargers') as any
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const features = map.queryRenderedFeatures(e.point, { layers: ['charger-clusters'] }) as any[]
          source.getClusterExpansionZoom(features[0].properties.cluster_id, (err: unknown, zoom: number) => {
            if (err) return
            map.easeTo({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              center: (features[0].geometry as any).coordinates,
              zoom,
            })
          })
        })

        // Click on individual pin → navigate to listing
        map.on('click', 'charger-pins', (e) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const feature = (e.features as any[])?.[0]
          const id = feature?.properties?.id as string | undefined
          if (id) window.location.href = `/listings/${id}`
        })

        // Pointer cursor on hover
        map.on('mouseenter', 'charger-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'charger-clusters', () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'charger-pins', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'charger-pins', () => { map.getCanvas().style.cursor = '' })

        setMapLoaded(true)
      })

      mapRef.current = map
      return () => { map.remove(); mapRef.current = null }
    }).catch(() => setMapLoaded(true))
  }, [userLocation, mapLoaded])

  // Sync listing pins whenever listings data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    const map = mapRef.current
    const source = map.getSource?.('chargers')
    if (!source) return

    const geojson = {
      type: 'FeatureCollection',
      features: listings.map((l) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.longitude, l.latitude] },
        properties: {
          id: l.id,
          title: l.title,
          powerKw: l.maxPowerKw,
          instantBook: l.instantBookEnabled,
        },
      })),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(source as any).setData(geojson)
  }, [listings, mapLoaded])

  const activeFilterCount = [
    filters.plugTypes.length > 0,
    filters.instantBookOnly,
    filters.availableNow,
    filters.minPowerKw != null,
    filters.maxPricePence != null,
  ].filter(Boolean).length

  return (
    <div className="relative flex h-[calc(100vh-4rem)] flex-col">
      {/* Search bar + filter button */}
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3">
        <div className="flex flex-1 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2">
          <MapPin className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Search near your location…</span>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
          className={cn(
            'flex h-10 items-center gap-2 rounded-[6px] border px-3 text-sm font-medium transition-colors',
            activeFilterCount > 0
              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]'
              : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel overlay */}
      {showFilters && (
        <div className="absolute left-4 right-4 top-16 z-30 sm:left-auto sm:right-4 sm:w-80">
          <FilterPanel
            filters={filters}
            onChange={(f) => { setFilters(f) }}
            onClose={() => setShowFilters(false)}
          />
        </div>
      )}

      {/* Main content: map + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="relative flex-1 bg-[hsl(var(--secondary))]">
          <div ref={mapContainerRef} className="absolute inset-0" aria-label="Map of EV chargers near you" role="img" />

          {/* Map placeholder when token not set */}
          {!process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <MapPin className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
              <div>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">Map requires Mapbox token</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment</p>
              </div>
            </div>
          )}

          {/* Locate me button */}
          <button
            type="button"
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) =>
                  setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                )
              }
            }}
            className={cn(
              'absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center',
              'rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-sm',
              'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors',
            )}
            aria-label="Centre map on my location"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Listing sidebar — desktop */}
        <aside
          className="hidden w-80 flex-col overflow-y-auto border-l border-[hsl(var(--border))] xl:flex"
          aria-label="Nearby chargers"
        >
          <div className="border-b border-[hsl(var(--border))] px-4 py-3">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {loading ? 'Searching…' : `${listings.length} chargers found`}
            </p>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[6px] bg-[hsl(var(--secondary))]" aria-hidden="true" />
              ))
            ) : listings.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Filter className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No chargers found with these filters.</p>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              listings.map((listing) => <ListingItem key={listing.id} listing={listing} />)
            )}
          </div>
        </aside>
      </div>

      {/* Mobile listing strip */}
      <div className="flex gap-3 overflow-x-auto border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 xl:hidden">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 w-56 shrink-0 animate-pulse rounded-[6px] bg-[hsl(var(--secondary))]" aria-hidden="true" />
            ))
          : listings.slice(0, 10).map((listing) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                className={cn(
                  'flex w-56 shrink-0 flex-col gap-1.5 rounded-[6px] border border-[hsl(var(--border))]',
                  'bg-[hsl(var(--card))] p-3 hover:border-[hsl(var(--primary)/0.4)] transition-colors',
                )}
              >
                <p className="truncate text-xs font-semibold text-[hsl(var(--foreground))]">{listing.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                  <Zap className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
                  {listing.maxPowerKw}kW
                  {listing.pricePerKwhPence != null && (
                    <span className="font-mono">£{(listing.pricePerKwhPence / 100).toFixed(2)}/kWh</span>
                  )}
                </div>
              </Link>
            ))}
      </div>
    </div>
  )
}
