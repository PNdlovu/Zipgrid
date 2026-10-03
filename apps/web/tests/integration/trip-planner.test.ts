/**
 * Trip planner against the real schema (PGlite): where the car must stop,
 * a free and compatible charger near that point with a booking window,
 * no stops when the battery covers the trip, and plug name normalising.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { pg, setupDatabase } from '../helpers/pglite-db'
import { TripPlanner, normalisePlugTypes, MILES_PER_KWH, ROAD_FACTOR } from '@/domains/trip/TripPlanner'

let driverId: string
let vehicleId: string
let listing: { id: string; lat: number; lng: number }

const MILES_PER_DEG_LAT = 69.05

/** Origin and destination due south/north of the listing, so the one stop lands on it. */
function tripThrough(target: { lat: number; lng: number }, straightMiles: number, stopFraction: number) {
  const span = straightMiles / MILES_PER_DEG_LAT
  const origin = { lat: target.lat - span * stopFraction, lng: target.lng, label: 'Start' }
  return { origin, destination: { lat: origin.lat + span, lng: target.lng, label: 'End' } }
}

const tomorrow = () => {
  const d = new Date(Date.now() + 26 * 3_600_000)
  d.setUTCMinutes(0, 0, 0)
  return d
}

beforeAll(async () => {
  await setupDatabase()
  const l = await pg.query<{ id: string; latitude: number; longitude: number; hu: string }>(
    `SELECT cl.id, cl.latitude, cl.longitude, hp.user_id AS hu
     FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
     WHERE cl.status = 'active' ORDER BY cl.id LIMIT 1`,
  )
  const row = l.rows[0]!
  listing = { id: row.id, lat: Number(row.latitude), lng: Number(row.longitude) }
  await pg.query(
    `UPDATE charger_listings SET plug_types = '{CCS2,Type2}', min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365, max_power_kw = 50, pricing_model = 'per_kwh', price_per_kwh_cents = 40,
            average_rating = 4.9
     WHERE id = $1`,
    [listing.id],
  )
  const d = await pg.query<{ uid: string; veh: string }>(
    `SELECT u.id AS uid, v.id AS veh
     FROM users u JOIN driver_profiles dp ON dp.user_id = u.id JOIN driver_vehicles v ON v.driver_profile_id = dp.id
     WHERE u.id <> $1 ORDER BY u.id LIMIT 1`,
    [row.hu],
  )
  driverId = d.rows[0]!.uid
  vehicleId = d.rows[0]!.veh
  // A small 10 kWh battery: ~35 miles of range, so a 50-mile road trip needs one stop.
  await pg.query(`UPDATE driver_vehicles SET battery_capacity_kwh = 10, plug_types = '{CCS2}' WHERE id = $1`, [vehicleId])
})

describe('trip planner', () => {
  it('normalises loose plug names to the enum and drops unknown ones', () => {
    expect(normalisePlugTypes(['type_2', 'ccs 2', 'CHADEMO', 'nonsense', 'Type2'])).toEqual(['Type2', 'CCS2', 'CHAdeMO'])
  })

  it('stops where the battery runs low and picks a free, compatible charger with a booking window', async () => {
    const straight = 40
    const firstStopMiles = (100 - 15) * (10 * MILES_PER_KWH / 100)
    const { origin, destination } = tripThrough(listing, straight, firstStopMiles / (straight * ROAD_FACTOR))

    const plan = await TripPlanner.planForUser({
      userId: driverId, origin, destination, departure: tomorrow(), batteryPercent: 100, vehicleId,
    })
    expect(plan.vehicle.id).toBe(vehicleId)
    expect(plan.distanceMiles).toBe(Math.round(straight * ROAD_FACTOR))
    expect(plan.stops).toHaveLength(1)
    const stop = plan.stops[0]!
    expect(stop.batteryOnArrivalPct).toBe(15)
    const options = [stop.best, stop.backup].filter(Boolean)
    expect(options.map((o) => o!.listingId)).toContain(listing.id)
    const ours = options.find((o) => o!.listingId === listing.id)!
    expect(ours.plugTypes).toContain('CCS2')
    expect(new Date(ours.bookStart).getTime()).toBeLessThanOrEqual(new Date(stop.arriveAt).getTime())
    expect(new Date(ours.bookEnd).getTime() - new Date(ours.bookStart).getTime()).toBeGreaterThanOrEqual(ours.chargeMinutes * 60_000)
    // 15% → 80% of 10 kWh = 6.5 kWh at 40p/kWh.
    expect(ours.estimatedCostPence).toBe(260)
    expect(new Date(plan.arrival).getTime()).toBeGreaterThan(new Date(plan.departure).getTime())
  })

  it("skips a charger that's booked when the car arrives", async () => {
    const straight = 40
    const firstStopMiles = (100 - 15) * (10 * MILES_PER_KWH / 100)
    const trip = tripThrough(listing, straight, firstStopMiles / (straight * ROAD_FACTOR))
    const departure = new Date(tomorrow().getTime() + 7 * 86_400_000)
    const first = await TripPlanner.planForUser({ userId: driverId, ...trip, departure, batteryPercent: 100, vehicleId })
    const ours = [first.stops[0]!.best, first.stops[0]!.backup].find((o) => o?.listingId === listing.id)!

    const other = await pg.query<{ dp: string; veh: string }>(
      `SELECT dp.id AS dp, v.id AS veh FROM driver_profiles dp JOIN driver_vehicles v ON v.driver_profile_id = dp.id
       WHERE dp.user_id <> $1 LIMIT 1`,
      [driverId],
    )
    await pg.query(
      `INSERT INTO bookings (listing_id, driver_profile_id, vehicle_id, scheduled_start, scheduled_end, status, pricing_model,
                            estimated_cost_cents, access_type, instant_book)
       SELECT $1, $2, $3, $4, $5, 'confirmed', 'per_kwh', 100, access_type, TRUE FROM charger_listings WHERE id = $1`,
      [listing.id, other.rows[0]!.dp, other.rows[0]!.veh, ours.bookStart, ours.bookEnd],
    )
    const second = await TripPlanner.planForUser({ userId: driverId, ...trip, departure, batteryPercent: 100, vehicleId })
    const ids = [second.stops[0]!.best, second.stops[0]!.backup].map((o) => o?.listingId)
    expect(ids).not.toContain(listing.id)
  })

  it('needs no stops when the battery covers the trip, and refuses to start too low', async () => {
    const short = tripThrough(listing, 10, 0.5)
    const plan = await TripPlanner.planForUser({ userId: driverId, ...short, departure: tomorrow(), batteryPercent: 100, vehicleId })
    expect(plan.stops).toEqual([])
    expect(plan.chargingMinutes).toBe(0)
    await expect(TripPlanner.planForUser({ userId: driverId, ...short, departure: tomorrow(), batteryPercent: 10, vehicleId }))
      .rejects.toThrow(/too low to set off/)
  })
})
