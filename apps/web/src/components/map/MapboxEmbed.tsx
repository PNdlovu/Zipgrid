/**
 * @file MapboxEmbed.tsx
 * @description Lazy-loaded Mapbox GL JS map container for the web app.
 * Renders a full Mapbox map inside a fixed-size div; exposes an `onMapLoaded`
 * callback with the raw mapboxgl.Map instance so callers can add sources and layers.
 *
 * Requires NEXT_PUBLIC_MAPBOX_TOKEN env var.
 * Falls back gracefully to a placeholder when the token is absent (local dev).
 *
 * @module components/map
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

type MapboxEmbedProps = {
  /** Initial centre coordinates */
  center?: [number, number]   // [lng, lat]
  zoom?: number
  style?: string
  className?: string
  /** Called once the map has finished loading style and sources */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMapLoaded?: (map: any) => void
  /** Whether to show the user's current location dot */
  showUserLocation?: boolean
}

/**
 * Lazy-loaded Mapbox GL JS map container.
 * Import dynamically from pages to avoid SSR issues:
 *   const Map = dynamic(() => import('@/components/map/MapboxEmbed'), { ssr: false })
 */
export function MapboxEmbed({
  center = [-0.1278, 51.5074],  // London default
  zoom = 12,
  style = 'mapbox://styles/mapbox/streets-v12',
  className,
  onMapLoaded,
  showUserLocation = true,
}: MapboxEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tokenMissing, setTokenMissing] = useState(false)

  useEffect(() => {
    const token = process.env['NEXT_PUBLIC_MAPBOX_TOKEN']
    if (!token) {
      setTokenMissing(true)
      return
    }

    let map: { remove: () => void } | null = null

    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!containerRef.current) return

      mapboxgl.accessToken = token

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map = new (mapboxgl as any).Map({
        container: containerRef.current,
        style,
        center,
        zoom,
      }) as { remove: () => void }

      if (showUserLocation) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(map as any).addControl(new (mapboxgl as any).GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
          showUserHeading: false,
        }), 'top-right')
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).on('load', () => {
        if (onMapLoaded) onMapLoaded(map)
      })
    })

    return () => {
      if (map) map.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally run once on mount

  if (tokenMissing) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-[8px]',
          'bg-[hsl(var(--secondary))] text-center',
          className,
        )}
      >
        <MapPin className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
        <div>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">Map requires Mapbox token</p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> to enable the map.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('rounded-[8px] overflow-hidden', className)}
      aria-label="Map of EV chargers"
      role="img"
    />
  )
}
