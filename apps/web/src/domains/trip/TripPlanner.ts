/**
 * @file TripPlanner.ts
 * @description Plans charging stops for a journey: where the car will need
 * charge, which bookable chargers near those points fit the car, are free
 * when it gets there, and are worth trusting, with a backup for each stop.
 *
 * Model (no routing API yet, so distances are estimates):
 *   - Road distance = straight line × ROAD_FACTOR; average speed AVG_MPH.
 *   - Range = battery kWh × MILES_PER_KWH, reduced in the cold.
 *   - Leave each stop at CHARGE_TO_PCT, arrive with at least the buffer.
 *   - A stop's booking covers the estimated charge time, rounded to 15 min
 *     and within the listing's min/max booking hours.
 *
 * Booking itself goes through BookingService (the concierge quotes each stop).
 *
 * @module domains/trip
 */

import { getDb } from '@/lib/db'
import { ValidationError } from '@/lib/errors/AppError'
import { distanceMetresSql, withinRadiusSql } from '@/lib/db/geo'
import { geocodeUkPlace } from '@/lib/geo/places'
import { AvailabilityService } from '@/domains/charging/AvailabilityService'

export const ROAD_FACTOR = 1.25
export const AVG_MPH = 50
export const MILES_PER_KWH = 3.5
export const CHARGE_TO_PCT = 80
const SEARCH_RADII_M = [10_000, 25_000]
const QUARTER_HOUR = 15 * 60_000

/** plug_type enum values, matched case- and punctuation-insensitively. */
const PLUG_TYPES = ['CCS1', 'CCS2', 'NACS', 'CHAdeMO', 'Type2', 'NEMA_14_50', 'NEMA_5_15', 'J1772'] as const
export type PlugType = (typeof PLUG_TYPES)[number]

/** Maps loose plug names ("type_2", "ccs 2", "chademo") to plug_type values; unknown names are dropped. */
export function normalisePlugTypes(names: string[]): PlugType[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const byKey = new Map(PLUG_TYPES.map((p) => [key(p), p]))
  return [...new Set(names.map((n) => byKey.get(key(n))).filter((p): p is PlugType => Boolean(p)))]
}

export type TripInput = {
  origin: { lat: number; lng: number; label: string }
  destination: { lat: number; lng: number; label: string }
  departure: Date
  batteryPercent: number
  batteryKwh: number
  plugTypes: PlugType[]
  temperatureC?: number
  arrivalBufferPercent?: number
  /** Excludes the user's own chargers. */
  userId?: string
}

export type StopOption = {
  listingId: string
  title: string
  city: string
  latitude: number
  longitude: number
  detourKm: number
  powerKw: number
  plugTypes: string[]
  pricingModel: string
  rating: number | null
  reviewCount: number
  instantBook: boolean
  /** Suggested booking window covering the charge. */
  bookStart: string
  bookEnd: string
  chargeMinutes: number
  estimatedCostPence: number
}

export type TripStop = {
  atMile: number
  arriveAt: string
  batteryOnArrivalPct: number
  batteryOnDeparturePct: number
  best: StopOption | null
  backup: StopOption | null
}

export type TripPlan = {
  origin: TripInput['origin']
  destination: TripInput['destination']
  distanceMiles: number
  drivingMinutes: number
  chargingMinutes: number
  departure: string
  arrival: string
  rangeMiles: number
  coldPenaltyPct: number
  stops: TripStop[]
  estimatedChargingCostPence: number
  warnings: string[]
}

function coldPenalty(tempC: number): number {
  if (tempC < 0) return 0.3
  if (tempC < 5) return 0.17
  if (tempC < 15) return 0.08
  return 0
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const along = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, f: number) =>
  ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f })

/** Minutes to add kWh at a charger, allowing for the car's acceptance rate (~1C, tapering). */
function chargeMinutesFor(kwh: number, chargerKw: number, batteryKwh: number): number {
  const kw = Math.max(1, Math.min(chargerKw, batteryKwh) * 0.85)
  return Math.ceil((kwh / kw) * 60)
}

/** Charging cost for a stop under the listing's own pricing model. */
function stopCostPence(row: Record<string, unknown>, kwh: number, minutes: number): number {
  const kwhP = Number(row['price_per_kwh_cents'] ?? 0)
  const hourP = Number(row['price_per_hour_cents'] ?? 0)
  const sessionP = Number(row['price_per_session_cents'] ?? 0)
  switch (row['pricing_model']) {
    case 'per_kwh': return Math.round(kwh * kwhP)
    case 'per_hour': return Math.round((minutes / 60) * hourP)
    case 'per_session': return sessionP
    case 'hybrid': return sessionP + Math.round(kwh * kwhP)
    default: return 0
  }
}

/** Ranks candidates: trusted, fast and close first. */
function score(row: Record<string, unknown>): number {
  const km = Number(row['dist_metres']) / 1000
  const rating = row['average_rating'] != null ? Number(row['average_rating']) : 4
  const power = Math.min(Number(row['max_power_kw']), 150)
  return rating * 10 + power / 10 - km * 1.5 + (row['instant_book_enabled'] ? 3 : 0)
}

type Place = { lat: number; lng: number; label: string }

export const TripPlanner = {
  /**
   * Plans a trip for a user's car: places may be UK names/postcodes or
   * coordinates; the vehicle defaults to their primary one.
   */
  async planForUser(input: {
    userId: string
    origin: string | Place
    destination: string | Place
    departure: Date
    batteryPercent: number
    vehicleId?: string | undefined
    temperatureC?: number | undefined
  }): Promise<TripPlan & { vehicle: { id: string; name: string } }> {
    const resolve = async (p: string | Place) => {
      if (typeof p !== 'string') return p
      const found = await geocodeUkPlace(p)
      if (!found) throw new ValidationError(`I couldn't find "${p}". Try a UK town or postcode.`)
      return found
    }
    const [origin, destination] = await Promise.all([resolve(input.origin), resolve(input.destination)])

    const db = await getDb()
    const veh = await db.execute(
      `SELECT v.id, v.make, v.model, v.battery_capacity_kwh, v.plug_types
       FROM driver_vehicles v JOIN driver_profiles dp ON dp.id = v.driver_profile_id
       WHERE dp.user_id = $1 AND COALESCE(v.is_active, TRUE) AND ($2::uuid IS NULL OR v.id = $2::uuid)
       ORDER BY v.is_primary DESC, v.created_at LIMIT 1`,
      [input.userId, input.vehicleId ?? null],
    )
    const v = veh.rows[0]
    if (!v) throw new ValidationError('No vehicle on the account. Add your car in Vehicles first.')
    const name = `${String(v['make'])} ${String(v['model'])}`
    if (v['battery_capacity_kwh'] == null) throw new ValidationError(`The ${name} has no battery size saved. Add it in Vehicles.`)
    const raw = v['plug_types']
    const plugs = normalisePlugTypes(Array.isArray(raw) ? raw.map(String) : String(raw ?? '').replace(/[{}"]/g, '').split(','))

    const plan = await this.plan({
      origin, destination,
      departure: input.departure,
      batteryPercent: input.batteryPercent,
      batteryKwh: Number(v['battery_capacity_kwh']),
      plugTypes: plugs,
      ...(input.temperatureC !== undefined ? { temperatureC: input.temperatureC } : {}),
      userId: input.userId,
    })
    return { ...plan, vehicle: { id: v['id'] as string, name } }
  },

  async plan(input: TripInput): Promise<TripPlan> {
    if (input.plugTypes.length === 0) throw new ValidationError('No compatible plug types for this car.')
    const buffer = input.arrivalBufferPercent ?? 15
    const penalty = coldPenalty(input.temperatureC ?? 15)
    const rangeMiles = input.batteryKwh * MILES_PER_KWH * (1 - penalty)
    const distanceMiles = milesBetween(input.origin, input.destination) * ROAD_FACTOR
    const milesPerPct = rangeMiles / 100
    const warnings: string[] = []

    // Where the car must stop: drive until the buffer, charge to CHARGE_TO_PCT, repeat.
    const stopMiles: number[] = []
    let pos = 0
    let pct = input.batteryPercent
    for (;;) {
      const canDrive = (pct - buffer) * milesPerPct
      if (canDrive <= 0) {
        throw new ValidationError(`The battery is too low to set off safely (${pct}%). Charge before starting.`)
      }
      if (pos + canDrive >= distanceMiles) break
      pos += canDrive
      stopMiles.push(pos)
      pct = CHARGE_TO_PCT
      if (stopMiles.length > 8) throw new ValidationError('That journey needs too many stops to plan here.')
    }

    const db = await getDb()
    const stops: TripStop[] = []
    let clock = input.departure.getTime()
    let lastMile = 0
    let batteryPct = input.batteryPercent
    let chargingMinutes = 0
    let cost = 0

    for (const mile of stopMiles) {
      clock += ((mile - lastMile) / AVG_MPH) * 3_600_000
      const arrivalPct = Math.round(batteryPct - (mile - lastMile) / milesPerPct)
      const kwh = ((CHARGE_TO_PCT - arrivalPct) / 100) * input.batteryKwh
      const point = along(input.origin, input.destination, mile / distanceMiles)
      const arriveAt = new Date(clock)

      const options: StopOption[] = []
      for (const radius of SEARCH_RADII_M) {
        const res = await db.execute(
          `SELECT cl.id, cl.title, cl.city, cl.latitude, cl.longitude, cl.max_power_kw, cl.plug_types,
                  cl.pricing_model, cl.price_per_kwh_cents, cl.price_per_hour_cents, cl.price_per_session_cents,
                  cl.min_booking_hours, cl.max_booking_hours, cl.instant_book_enabled, cl.average_rating, cl.review_count,
                  ${distanceMetresSql('cl.latitude', 'cl.longitude', '$1', '$2')} AS dist_metres
           FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
           WHERE cl.status = 'active' AND cl.plug_types && $3::plug_type[]
             AND ($5::uuid IS NULL OR hp.user_id <> $5::uuid)
             AND ${withinRadiusSql('cl.latitude', 'cl.longitude', '$1', '$2', '$4')}
           ORDER BY dist_metres LIMIT 15`,
          [point.lat, point.lng, `{${input.plugTypes.join(',')}}`, radius, input.userId ?? null],
        )
        const ranked = [...res.rows].sort((a, b) => score(b) - score(a))
        for (const row of ranked) {
          const minutes = chargeMinutesFor(kwh, Number(row['max_power_kw']), input.batteryKwh)
          const minH = Number(row['min_booking_hours'] ?? 0)
          const maxH = Number(row['max_booking_hours'] ?? 24)
          const start = new Date(Math.floor(arriveAt.getTime() / QUARTER_HOUR) * QUARTER_HOUR)
          const wantMs = Math.max(Math.ceil((minutes * 60_000) / QUARTER_HOUR) * QUARTER_HOUR, minH * 3_600_000)
          if (wantMs > maxH * 3_600_000) continue
          const end = new Date(start.getTime() + wantMs)
          if (start.getTime() <= Date.now()) continue
          if (!(await AvailabilityService.isAvailable(row['id'] as string, start, end))) continue
          options.push({
            listingId: row['id'] as string,
            title: row['title'] as string,
            city: row['city'] as string,
            latitude: Number(row['latitude']),
            longitude: Number(row['longitude']),
            detourKm: Math.round(Number(row['dist_metres']) / 100) / 10,
            powerKw: Number(row['max_power_kw']),
            plugTypes: (row['plug_types'] as string[] | null) ?? [],
            pricingModel: row['pricing_model'] as string,
            rating: row['average_rating'] != null ? Number(row['average_rating']) : null,
            reviewCount: Number(row['review_count'] ?? 0),
            instantBook: Boolean(row['instant_book_enabled']),
            bookStart: start.toISOString(),
            bookEnd: end.toISOString(),
            chargeMinutes: minutes,
            estimatedCostPence: stopCostPence(row, kwh, minutes),
          })
          if (options.length === 2) break
        }
        if (options.length === 2) break
      }

      const best = options[0] ?? null
      if (!best) {
        warnings.push(`No bookable charger is free near mile ${Math.round(mile)} around ${arriveAt.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}. Plan a public rapid charger there.`)
      } else if (!options[1]) {
        warnings.push(`Only one bookable charger near mile ${Math.round(mile)}; no backup.`)
      }
      const stayMinutes = best?.chargeMinutes ?? chargeMinutesFor(kwh, 50, input.batteryKwh)
      stops.push({
        atMile: Math.round(mile),
        arriveAt: arriveAt.toISOString(),
        batteryOnArrivalPct: arrivalPct,
        batteryOnDeparturePct: CHARGE_TO_PCT,
        best,
        backup: options[1] ?? null,
      })
      clock += stayMinutes * 60_000
      chargingMinutes += stayMinutes
      cost += best?.estimatedCostPence ?? 0
      lastMile = mile
      batteryPct = CHARGE_TO_PCT
    }

    clock += ((distanceMiles - lastMile) / AVG_MPH) * 3_600_000
    return {
      origin: input.origin,
      destination: input.destination,
      distanceMiles: Math.round(distanceMiles),
      drivingMinutes: Math.round((distanceMiles / AVG_MPH) * 60),
      chargingMinutes,
      departure: input.departure.toISOString(),
      arrival: new Date(clock).toISOString(),
      rangeMiles: Math.round(rangeMiles),
      coldPenaltyPct: Math.round(penalty * 100),
      stops,
      estimatedChargingCostPence: cost,
      warnings,
    }
  },
}
