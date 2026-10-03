/**
 * @file places.ts
 * @description Resolves a UK postcode or place name ("Manchester",
 * "Leeds city centre") to coordinates via postcodes.io (free, keyless).
 * @module lib/geo
 */

import { geocodeUkPostcode } from './postcode'

export type PlaceResult = { lat: number; lng: number; label: string }

/** Coordinates for a UK postcode or place name, or null when not found. */
export async function geocodeUkPlace(query: string): Promise<PlaceResult | null> {
  const q = query.trim()
  if (!q) return null
  const pc = await geocodeUkPostcode(q)
  if (pc) return { lat: pc.lat, lng: pc.lng, label: pc.postcode }

  try {
    const res = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=5`, {
      signal: AbortSignal.timeout(4_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      result?: { name_1: string; county_unitary?: string | null; region?: string | null; latitude: number; longitude: number; local_type?: string }[] | null
    }
    const places = data.result ?? []
    // Prefer cities and towns over hamlets that share the name.
    const rank = (t?: string) => (t === 'City' ? 0 : t === 'Town' ? 1 : t === 'Suburban Area' ? 2 : 3)
    const best = [...places].sort((a, b) => rank(a.local_type) - rank(b.local_type))[0]
    if (!best) return null
    return {
      lat: best.latitude,
      lng: best.longitude,
      label: [best.name_1, best.county_unitary ?? best.region].filter(Boolean).join(', '),
    }
  } catch {
    return null
  }
}
