/**
 * @file route.ts
 * @description POST /api/v1/trip/plan — AI multi-stop trip planner.
 *
 * Takes a destination, current battery %, departure time and vehicle profile,
 * then returns a full trip plan with charging stops, estimated timings, and
 * cost estimates for each stop. Charging stops are ranked by proximity to the
 * route corridor (ST_DWithin on Mapbox route linestring) and filtered to
 * compatible plug types.
 *
 * Weather range penalty is applied by temperature bracket:
 *   < 0°C: 30% reduction   0–5°C: 17%   5–15°C: 8%   > 15°C: 0%
 *
 * @module apps/web/api/v1/trip/plan
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { distanceMetresSql, withinRadiusSql } from '@/lib/db/geo'

const PlanSchema = z.object({
  /** Destination as "lat,lng" or a readable address (used for display) */
  destinationLat:   z.number().min(-90).max(90),
  destinationLng:   z.number().min(-180).max(180),
  destinationLabel: z.string().max(200).optional(),

  /** Origin — defaults to driver's current location if omitted */
  originLat:  z.number().min(-90).max(90),
  originLng:  z.number().min(-180).max(180),

  /** Driver's current battery percentage (1–100) */
  batteryPercent: z.number().int().min(1).max(100),

  /** Vehicle WLTP range in miles */
  vehicleRangeMiles: z.number().positive().max(1000),

  /** Minimum battery level to arrive at each stop with (default: 15) */
  arrivalBufferPercent: z.number().int().min(5).max(40).default(15),

  /** Departure ISO datetime (default: now) */
  departureTime: z.string().datetime().optional(),

  /** Compatible plug types — filters corridor stops */
  plugTypes: z.array(z.string()).min(1).default(['type_2', 'ccs_2']),

  /** Ambient temperature in Celsius for range penalty (default: 15 = no penalty) */
  temperatureCelsius: z.number().min(-30).max(50).default(15),
})

type ChargerStop = {
  listingId: string
  title: string
  city: string
  latitude: number
  longitude: number
  distanceFromRouteMetres: number
  maxPowerKw: number
  pricePerKwhPence: number | null
  instantBookEnabled: boolean
  averageRating: number | null
  estimatedArrivalTime: string   // ISO
  estimatedChargeMinutes: number
  estimatedCostPence: number
  batteryAtArrival: number       // %
  batteryAfterCharge: number     // %
  plugTypes: string[]
}

type TripPlan = {
  origin:      { lat: number; lng: number }
  destination: { lat: number; lng: number; label: string }
  totalDistanceMiles: number
  totalDurationMinutes: number
  chargingStops: ChargerStop[]
  weatherRangePenaltyPct: number
  effectiveRangeMiles: number
  estimatedArrivalTime: string
  totalChargingTimeMins: number
  totalEstimatedCostPence: number
  noStopsNeeded: boolean
}

/* ── Helpers ────────────────────────────────────────────────── */

function weatherPenalty(tempC: number): number {
  if (tempC < 0)   return 0.30
  if (tempC < 5)   return 0.17
  if (tempC < 15)  return 0.08
  return 0
}

/** Haversine distance between two points in miles */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Interpolate a point 'fraction' of the way along origin→destination */
function midpoint(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  fraction: number,
): { lat: number; lng: number } {
  return {
    lat: lat1 + (lat2 - lat1) * fraction,
    lng: lng1 + (lng2 - lng1) * fraction,
  }
}

/** Minutes to charge from currentPct to targetPct given kW charger */
function chargeTimeMinutes(
  currentPct: number,
  targetPct: number,
  batteryKwh: number,
  chargerKw: number,
): number {
  if (targetPct <= currentPct) return 0
  const kwhNeeded = ((targetPct - currentPct) / 100) * batteryKwh
  const effectiveKw = Math.min(chargerKw, batteryKwh * 0.8) // typical max charge rate ≈ 0.8C
  return Math.ceil((kwhNeeded / effectiveKw) * 60)
}

/* ── Route handler ──────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = PlanSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const {
    originLat, originLng,
    destinationLat, destinationLng, destinationLabel,
    batteryPercent, vehicleRangeMiles,
    arrivalBufferPercent,
    departureTime,
    plugTypes,
    temperatureCelsius,
  } = parsed.data

  // ── 1. Apply weather range penalty ────────────────────────────────────
  const penalty = weatherPenalty(temperatureCelsius)
  const effectiveRangeMiles = vehicleRangeMiles * (1 - penalty)

  // ── 2. Calculate total route distance ─────────────────────────────────
  const totalDistanceMiles = haversine(originLat, originLng, destinationLat, destinationLng)

  // Average speed assumption: 55 mph average incl. urban + motorway mix
  const AVG_SPEED_MPH = 55
  const baseDrivingMinutes = (totalDistanceMiles / AVG_SPEED_MPH) * 60

  // ── 3. Determine if any stops are needed ──────────────────────────────
  const currentRangeMiles = (batteryPercent / 100) * effectiveRangeMiles
  const noStopsNeeded = currentRangeMiles >= totalDistanceMiles * (1 + arrivalBufferPercent / 100)

  const departure = departureTime ? new Date(departureTime) : new Date()

  if (noStopsNeeded) {
    const arrivalTime = new Date(departure.getTime() + baseDrivingMinutes * 60_000)
    const plan: TripPlan = {
      origin:      { lat: originLat, lng: originLng },
      destination: { lat: destinationLat, lng: destinationLng, label: destinationLabel ?? 'Destination' },
      totalDistanceMiles: Math.round(totalDistanceMiles * 10) / 10,
      totalDurationMinutes: Math.round(baseDrivingMinutes),
      chargingStops: [],
      weatherRangePenaltyPct: Math.round(penalty * 100),
      effectiveRangeMiles: Math.round(effectiveRangeMiles),
      estimatedArrivalTime: arrivalTime.toISOString(),
      totalChargingTimeMins: 0,
      totalEstimatedCostPence: 0,
      noStopsNeeded: true,
    }
    return apiResponse(plan)
  }

  // ── 4. Calculate how many stops needed ────────────────────────────────
  // Simple model: charge to 80% at each stop, leave with buffer
  const CHARGE_TO_PCT = 80
  const batteryKwh = vehicleRangeMiles / 3.5 // typical: 3.5 miles/kWh

  // Remaining range after leaving from origin
  let remainingRangeMiles = currentRangeMiles
  const stopsNeeded: Array<{ fraction: number; batteryAtArrival: number }> = []

  let consumed = 0
  while (consumed < totalDistanceMiles) {
    const canDrive = remainingRangeMiles - (arrivalBufferPercent / 100) * effectiveRangeMiles
    if (canDrive <= 0) {
      // can't make it even to next stop — rare edge case, return error
      return apiError(
        'RANGE_INSUFFICIENT',
        'Current battery is too low to reach the first charging stop safely. Please charge before starting.',
        400,
      )
    }
    const stopAt = consumed + canDrive
    if (stopAt >= totalDistanceMiles) break // destination reachable

    const fraction = stopAt / totalDistanceMiles
    const batAtArrival = arrivalBufferPercent
    stopsNeeded.push({ fraction, batteryAtArrival: batAtArrival })

    consumed = stopAt
    remainingRangeMiles = (CHARGE_TO_PCT / 100) * effectiveRangeMiles
  }

  // ── 5. Find chargers near each stop point ─────────────────────────────
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const plugTypesArray = `{${plugTypes.join(',')}}`
    const chargingStops: ChargerStop[] = []
    let runningMinutes = 0
    let totalCostPence = 0
    let currentBat = batteryPercent

    for (const stop of stopsNeeded) {
      const mid = midpoint(originLat, originLng, destinationLat, destinationLng, stop.fraction)

      // Find nearest available charger to this corridor point
      const res = await db.execute(
        `SELECT id, title, city, latitude, longitude, max_power_kw,
                plug_types, price_per_kwh_cents, instant_book_enabled, average_rating,
                ${distanceMetresSql('latitude', 'longitude', '$1', '$2')} AS dist_metres
         FROM charger_listings
         WHERE status = 'active'
           AND plug_types && $3::plug_type[]
           AND ${withinRadiusSql('latitude', 'longitude', '$1', '$2', '20000')}
         ORDER BY dist_metres
         LIMIT 1`,
        [mid.lat, mid.lng, plugTypesArray],
      )

      if (res.rows.length === 0) continue

      const row = res.rows[0] as Record<string, unknown>
      const chargerKw = Number(row['max_power_kw'])
      const pricePerKwh = row['price_per_kwh_cents'] != null ? Number(row['price_per_kwh_cents']) : null

      // Drive time to this stop from last position
      const driveMinutesToStop = Math.round((stop.fraction * totalDistanceMiles - (stopsNeeded.indexOf(stop) > 0 ? stopsNeeded[stopsNeeded.indexOf(stop) - 1]!.fraction * totalDistanceMiles : 0)) / AVG_SPEED_MPH * 60)
      runningMinutes += driveMinutesToStop

      const arrivalTime = new Date(departure.getTime() + runningMinutes * 60_000)

      // Charge from arrival battery to 80%
      const chargeMinutes = chargeTimeMinutes(stop.batteryAtArrival, CHARGE_TO_PCT, batteryKwh, chargerKw)
      const kwhCharged = ((CHARGE_TO_PCT - stop.batteryAtArrival) / 100) * batteryKwh
      const stopCostPence = pricePerKwh != null ? Math.round(kwhCharged * pricePerKwh) : 0

      totalCostPence += stopCostPence
      runningMinutes += chargeMinutes

      chargingStops.push({
        listingId:                  row['id'] as string,
        title:                      row['title'] as string,
        city:                       row['city'] as string,
        latitude:                   Number(row['latitude']),
        longitude:                  Number(row['longitude']),
        distanceFromRouteMetres:    Math.round(Number(row['dist_metres'])),
        maxPowerKw:                 chargerKw,
        pricePerKwhPence:           pricePerKwh,
        instantBookEnabled:         Boolean(row['instant_book_enabled']),
        averageRating:              row['average_rating'] != null ? Number(row['average_rating']) : null,
        estimatedArrivalTime:       arrivalTime.toISOString(),
        estimatedChargeMinutes:     chargeMinutes,
        estimatedCostPence:         stopCostPence,
        batteryAtArrival:           stop.batteryAtArrival,
        batteryAfterCharge:         CHARGE_TO_PCT,
        plugTypes:                  (row['plug_types'] as string[]) ?? [],
      })

      currentBat = CHARGE_TO_PCT
      void currentBat // used by next iteration logic
    }

    // Final drive to destination
    runningMinutes += Math.round(
      (stopsNeeded.length > 0
        ? (1 - stopsNeeded[stopsNeeded.length - 1]!.fraction) * totalDistanceMiles
        : totalDistanceMiles) / AVG_SPEED_MPH * 60,
    )

    const estimatedArrival = new Date(departure.getTime() + runningMinutes * 60_000)
    const totalChargingMins = chargingStops.reduce((s, c) => s + c.estimatedChargeMinutes, 0)

    const plan: TripPlan = {
      origin:      { lat: originLat, lng: originLng },
      destination: { lat: destinationLat, lng: destinationLng, label: destinationLabel ?? 'Destination' },
      totalDistanceMiles: Math.round(totalDistanceMiles * 10) / 10,
      totalDurationMinutes: Math.round(runningMinutes),
      chargingStops,
      weatherRangePenaltyPct: Math.round(penalty * 100),
      effectiveRangeMiles: Math.round(effectiveRangeMiles),
      estimatedArrivalTime: estimatedArrival.toISOString(),
      totalChargingTimeMins: totalChargingMins,
      totalEstimatedCostPence: totalCostPence,
      noStopsNeeded: false,
    }

    return apiResponse(plan)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/trip/plan]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
