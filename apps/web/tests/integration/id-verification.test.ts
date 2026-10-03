/**
 * ID verification is required to book a charger and to publish a listing
 * (the site promises ID-verified drivers and hosts).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { pg, setupDatabase } from '../helpers/pglite-db'
import { BookingService } from '@/domains/booking/BookingService'
import { ListingService } from '@/domains/charging/ListingService'

let driver: { userId: string; vehicleId: string }
let host: { userId: string; draftListingId: string }
let listingId: string

const slot = () => {
  const start = new Date(Date.now() + 48 * 3_600_000)
  start.setUTCMinutes(0, 0, 0)
  return { scheduledStart: start, scheduledEnd: new Date(start.getTime() + 3_600_000) }
}

beforeAll(async () => {
  await setupDatabase()
  const l = await pg.query<{ id: string; hp: string; hu: string }>(
    `SELECT cl.id, cl.host_profile_id AS hp, hp.user_id AS hu FROM charger_listings cl
     JOIN host_profiles hp ON hp.id = cl.host_profile_id WHERE cl.status = 'active' ORDER BY cl.id LIMIT 1`,
  )
  listingId = l.rows[0]!.id
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24, advance_booking_days = 365
     WHERE id = $1`,
    [listingId],
  )
  const d = await pg.query<{ uid: string; veh: string }>(
    `SELECT u.id AS uid, v.id AS veh FROM users u JOIN driver_profiles dp ON dp.user_id = u.id
     JOIN driver_vehicles v ON v.driver_profile_id = dp.id WHERE u.id <> $1 ORDER BY u.id LIMIT 1`,
    [l.rows[0]!.hu],
  )
  driver = { userId: d.rows[0]!.uid, vehicleId: d.rows[0]!.veh }
  await pg.query(
    `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, 100000, 0)
     ON CONFLICT (user_id) DO UPDATE SET balance_pence = 100000, pending_pence = 0`,
    [driver.userId],
  )
  await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [driver.userId])

  // A paused copy of the host's listing to publish.
  const draft = await pg.query<{ id: string }>(
    `INSERT INTO charger_listings (host_profile_id, title, description, address_line1, city, postal_code, latitude, longitude,
       charger_level, plug_types, max_power_kw, num_ports, pricing_model, price_per_hour_cents, access_type, status, insurance_tos_accepted)
     SELECT host_profile_id, title || ' (copy)', description, address_line1, city, postal_code, latitude, longitude,
       charger_level, plug_types, max_power_kw, num_ports, 'per_hour', 400, access_type, 'paused', TRUE
     FROM charger_listings WHERE id = $1 RETURNING id`,
    [listingId],
  )
  host = { userId: l.rows[0]!.hu, draftListingId: draft.rows[0]!.id }
})

afterAll(async () => {
  await pg.query(`UPDATE users SET kyc_status = 'verified' WHERE id = ANY($1::uuid[])`, [[driver.userId, host.userId]])
})

describe('ID verification', () => {
  it('blocks quotes and bookings until the driver is verified', async () => {
    await pg.query(`UPDATE users SET kyc_status = 'not_started' WHERE id = $1`, [driver.userId])
    const input = { userId: driver.userId, listingId, vehicleId: driver.vehicleId, ...slot() }
    await expect(BookingService.quote(input)).rejects.toMatchObject({ code: 'ID_VERIFICATION_REQUIRED', statusCode: 403 })
    await expect(BookingService.create({ ...input, paymentMethodId: null, payWithWallet: true }))
      .rejects.toThrow(/verified ID to book a charger\. Verify your ID in Profile/)

    await pg.query(`UPDATE users SET kyc_status = 'pending' WHERE id = $1`, [driver.userId])
    await expect(BookingService.quote(input)).rejects.toThrow(/still being processed/)

    await pg.query(`UPDATE users SET kyc_status = 'verified' WHERE id = $1`, [driver.userId])
    const b = await BookingService.create({ ...input, paymentMethodId: null, payWithWallet: true })
    expect(b.status).toBe('confirmed')
  })

  it("won't publish a listing until the host is verified", async () => {
    await pg.query(`UPDATE users SET kyc_status = 'failed' WHERE id = $1`, [host.userId])
    await expect(ListingService.publish(host.draftListingId, host.userId)).rejects.toThrow(/did not go through/)
    await pg.query(`UPDATE users SET kyc_status = 'verified' WHERE id = $1`, [host.userId])
    await ListingService.publish(host.draftListingId, host.userId)
    const r = await pg.query<{ status: string }>(`SELECT status FROM charger_listings WHERE id = $1`, [host.draftListingId])
    expect(r.rows[0]!.status).toBe('active')
  })
})
