/**
 * @file postcode.ts
 * @description UK postcode geocoding via postcodes.io (free, keyless).
 * @module lib/geo
 */

export type GeocodeResult = { lat: number; lng: number; postcode: string }

/** Returns coordinates for a UK postcode, or null if unknown/unreachable. */
export async function geocodeUkPostcode(postcode: string): Promise<GeocodeResult | null> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(clean)) return null
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(4_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { result?: { latitude: number; longitude: number; postcode: string } }
    if (!data.result) return null
    return { lat: data.result.latitude, lng: data.result.longitude, postcode: data.result.postcode }
  } catch {
    return null
  }
}
