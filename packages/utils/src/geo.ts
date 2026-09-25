/**
 * @file geo.ts
 * @description Geospatial utility functions for distance and postcode formatting.
 * @module @zipgrid/utils
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/**
 * Formats a distance in metres to a human-readable string.
 * @example formatDistance(450) // "450 m"
 * @example formatDistance(1600) // "1.6 km"
 */
export function formatDistanceMetres(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

/**
 * Formats a distance in metres to miles (for UK display).
 * @example formatDistanceMiles(1609) // "1.0 mi"
 */
export function formatDistanceMiles(metres: number): string {
  const miles = metres / 1609.34
  return miles < 0.1 ? `${Math.round(metres)} m` : `${miles.toFixed(1)} mi`
}
