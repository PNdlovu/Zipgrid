/**
 * @file route.ts
 * @description GET /api/v1/listings/nearby — PostGIS geo-proximity charger search.
 * The primary search endpoint used by the map view and driver search.
 *
 * Query params:
 *   lat           — latitude (required unless postcode provided)
 *   lng           — longitude (required unless postcode provided)
 *   postcode      — UK postcode (geocoded server-side if lat/lng absent)
 *   radiusKm      — search radius in km (default 10, max 50)
 *   plugType      — filter by connector type
 *   minPowerKw    — minimum charger power in kW
 *   pricingModel  — per_kwh | per_hour | per_session
 *   instantBook   — true | false
 *   page          — page number (default 1)
 *   pageSize      — results per page (default 20, max 50)
 *   available     — true = exclude listings with active bookings right now
 *
 * @module apps/web/api/v1/listings/nearby
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { distanceMetresSql, withinRadiusSql } from '@/lib/db/geo'

const WITHIN = withinRadiusSql('cl.latitude', 'cl.longitude', '$2', '$1', '$3')
const DISTANCE = distanceMetresSql('cl.latitude', 'cl.longitude', '$2', '$1')

/**
 * Geocodes a UK postcode to lat/lng via postcodes.io (free, no key required).
 * Returns null if the postcode is not found.
 */
async function geocodePostcode(
  postcode: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
      { signal: AbortSignal.timeout(4_000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { result?: { latitude: number; longitude: number } }
    if (!data.result) return null
    return { lat: data.result.latitude, lng: data.result.longitude }
  } catch {
    return null
  }
}

/** GET /api/v1/listings/nearby — PostGIS geo-proximity charger search. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  // ── Parse params ─────────────────────────────────────────
  let lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null
  let lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : null
  const postcode    = searchParams.get('postcode')
  const radiusKm    = Math.min(50, Math.max(0.1, parseFloat(searchParams.get('radiusKm') ?? '10') || 10))
  const plugType    = searchParams.get('plugType')
  const minPowerKw  = searchParams.get('minPowerKw') ? parseFloat(searchParams.get('minPowerKw')!) : null
  const pricingModel= searchParams.get('pricingModel')
  const instantBook = searchParams.get('instantBook')
  const page        = Math.max(1, parseInt(searchParams.get('page')     ?? '1',  10))
  const pageSize    = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20))
  const offset      = (page - 1) * pageSize
  const availableNow= searchParams.get('available') === 'true'

  // ── Resolve coordinates ───────────────────────────────────
  if ((lat === null || lng === null) && postcode) {
    const geo = await geocodePostcode(postcode)
    if (geo) { lat = geo.lat; lng = geo.lng }
  }

  if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
    return apiError(
      'MISSING_LOCATION',
      'Provide lat & lng, or a valid UK postcode.',
      422,
    )
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return apiError('INVALID_LOCATION', 'Coordinates out of range.', 422)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // ── Build parameterised query ─────────────────────────
    const params: unknown[] = [lng, lat, radiusKm * 1000] // $1 lng, $2 lat, $3 radius (m)
    let i = params.length + 1

    const conditions: string[] = [`cl.status = 'active'`]

    if (plugType) {
      conditions.push(`$${i++} = ANY(cl.plug_types)`)
      params.push(plugType)
    }
    if (minPowerKw !== null) {
      conditions.push(`cl.max_power_kw >= $${i++}`)
      params.push(minPowerKw)
    }
    if (pricingModel) {
      conditions.push(`cl.pricing_model = $${i++}`)
      params.push(pricingModel)
    }
    if (instantBook === 'true') {
      conditions.push(`cl.instant_book_enabled = TRUE`)
    }
    if (availableNow) {
      // Exclude listings where a booking is active RIGHT NOW
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM bookings ab
        WHERE ab.listing_id = cl.id
          AND ab.status IN ('confirmed','active')
          AND ab.scheduled_start <= NOW()
          AND ab.scheduled_end   >= NOW()
      )`)
    }

    const where = conditions.join(' AND ')

    const [countRes, listingsRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total
         FROM charger_listings cl
         WHERE ${where}
           AND ${WITHIN}`,
        params,
      ),
      db.execute(
        `SELECT
           cl.id,
           cl.title,
           cl.city,
           cl.postal_code AS postcode,
           cl.latitude,
           cl.longitude,
           cl.charger_level,
           cl.plug_types,
           cl.max_power_kw,
           cl.charger_brand,
           cl.charger_model,
           cl.pricing_model,
           cl.price_per_kwh_cents  AS price_per_kwh_pence,
           cl.price_per_hour_cents AS price_per_hour_pence,
           cl.price_per_session_cents AS price_per_session_pence,
           cl.idle_fee_per_min_cents  AS idle_fee_per_min_pence,
           cl.instant_book_enabled,
           cl.average_rating,
           cl.review_count,
           cl.wifi_available,
           cl.shelter_available,
           cl.ev_parking_only,
           -- Distance in metres from search point
           ROUND(${DISTANCE})::INT AS distance_m,
           -- First photo (if any)
           (SELECT cdn_url FROM listing_photos lp
            WHERE lp.listing_id = cl.id AND lp.is_cover = TRUE
            LIMIT 1) AS cover_photo_url
         FROM charger_listings cl
         WHERE ${where}
           AND ${WITHIN}
         ORDER BY distance_m ASC, cl.average_rating DESC NULLS LAST
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total

    return apiResponse(
      listingsRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          id:                  row['id'],
          title:               row['title'],
          city:                row['city'],
          postcode:            row['postcode'],
          latitude:            Number(row['latitude']),
          longitude:           Number(row['longitude']),
          chargerLevel:        row['charger_level'],
          plugTypes:           row['plug_types'],
          maxPowerKw:          Number(row['max_power_kw']),
          chargerBrand:        row['charger_brand'],
          chargerModel:        row['charger_model'],
          pricingModel:        row['pricing_model'],
          pricePerKwhPence:    row['price_per_kwh_pence']     != null ? Number(row['price_per_kwh_pence'])     : null,
          pricePerHourPence:   row['price_per_hour_pence']    != null ? Number(row['price_per_hour_pence'])    : null,
          pricePerSessionPence:row['price_per_session_pence'] != null ? Number(row['price_per_session_pence']) : null,
          idleFeePerMinPence:  Number(row['idle_fee_per_min_pence'] ?? 0),
          instantBookEnabled:  Boolean(row['instant_book_enabled']),
          averageRating:       row['average_rating'] != null ? Number(row['average_rating']) : null,
          reviewCount:         Number(row['review_count'] ?? 0),
          wifiAvailable:       Boolean(row['wifi_available']),
          shelterAvailable:    Boolean(row['shelter_available']),
          evParkingOnly:       Boolean(row['ev_parking_only']),
          distanceM:           Number(row['distance_m']),
          coverPhotoUrl:       (row['cover_photo_url'] as string | null) ?? null,
        }
      }),
      { page, pageSize, total },
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/listings/nearby]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
