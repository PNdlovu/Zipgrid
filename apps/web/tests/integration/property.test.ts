/**
 * Residential properties against the real schema (PGlite): property CRUD,
 * bays, resident invites, access rules + resident discount at booking, the
 * revenue split at capture, and archiving. Emails are captured, not sent.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Email from '@/lib/email'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

const sent: { to: string; text: string }[] = []
vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof Email>()),
  sendEmail: async (m: { to: string; text: string }) => { sent.push(m); return true },
}))

import { pg, setupDatabase, dbModule } from '../helpers/pglite-db'
import { PropertyService, type PropertyInput } from '@/domains/property/PropertyService'
import { BookingService } from '@/domains/booking/BookingService'
import { EarningsAllocator } from '@/domains/payments/EarningsAllocator'

type Driver = { userId: string; email: string; vehicleId: string }

let hostUserId: string
let otherHostUserId: string
let listingId: string
let otherHostListingId: string
let resident: Driver
let outsider: Driver

const base: PropertyInput = {
  name: 'Harbour View', addressLine1: '1 Quay St', city: 'Bristol', postcode: 'bs1 4dj',
  revenueModel: 'split', splitPropertyPct: 70, accessMode: 'residents_only', residentDiscountPct: 20,
}

function tokenFrom(email: string): string {
  const m = [...sent].reverse().find((s) => s.to === email)?.text.match(/token=([^\s&]+)/)
  if (!m) throw new Error(`no invite email to ${email}`)
  return decodeURIComponent(m[1]!)
}

let slotHours = 6
function slot(hoursAhead?: number) {
  const start = new Date(Date.now() + (hoursAhead ?? (slotHours += 3)) * 3_600_000)
  start.setUTCMinutes(0, 0, 0)
  return { scheduledStart: start, scheduledEnd: new Date(start.getTime() + 3_600_000) }
}

const book = (d: Driver, hoursAhead?: number) =>
  BookingService.create({ userId: d.userId, listingId, vehicleId: d.vehicleId, ...slot(hoursAhead), paymentMethodId: null, payWithWallet: true })

/** A fresh property with the listing as a bay and `resident` accepted. */
async function propertyWithResident(input: Partial<PropertyInput> = {}) {
  const { id } = await PropertyService.create(hostUserId, { ...base, ...input })
  const bay = await PropertyService.addBay(hostUserId, id, listingId, 'B1')
  const r = await PropertyService.inviteResident(hostUserId, id, resident.email, 'Flat 4')
  await PropertyService.acceptInvite(resident.userId, tokenFrom(resident.email))
  return { propertyId: id, bayId: bay.id, residentId: r.id }
}

beforeAll(async () => {
  await setupDatabase()
  const hosts = await pg.query<{ hu: string; listing: string }>(
    `SELECT DISTINCT ON (hp.id) hp.user_id AS hu, cl.id AS listing
     FROM host_profiles hp JOIN charger_listings cl ON cl.host_profile_id = hp.id
     WHERE cl.status = 'active' ORDER BY hp.id, cl.id LIMIT 2`,
  )
  if (hosts.rows.length < 2) throw new Error('seed data needs two hosts with active listings')
  ;[{ hu: hostUserId, listing: listingId }, { hu: otherHostUserId, listing: otherHostListingId }] =
    hosts.rows as [{ hu: string; listing: string }, { hu: string; listing: string }]
  const drivers = await pg.query<{ uid: string; email: string; veh: string }>(
    `SELECT DISTINCT ON (u.id) u.id AS uid, u.email, v.id AS veh
     FROM users u JOIN driver_profiles dp ON dp.user_id = u.id JOIN driver_vehicles v ON v.driver_profile_id = dp.id
     WHERE u.id NOT IN ($1, $2) ORDER BY u.id LIMIT 2`,
    [hostUserId, otherHostUserId],
  )
  if (drivers.rows.length < 2) throw new Error('seed data needs two drivers with vehicles')
  ;[resident, outsider] = drivers.rows.map((d) => ({ userId: d.uid, email: d.email, vehicleId: d.veh })) as [Driver, Driver]
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365, pricing_model = 'per_hour', price_per_hour_cents = 500
     WHERE id = $1`,
    [listingId],
  )
  for (const d of [resident, outsider]) {
    await pg.query(
      `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, 100000, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance_pence = 100000, pending_pence = 0`,
      [d.userId],
    )
    await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [d.userId])
  }
})

beforeEach(async () => {
  // Each test starts with no live property holding the listing.
  await pg.query(`UPDATE properties SET archived_at = NOW() WHERE archived_at IS NULL`)
  await pg.query(`DELETE FROM property_bays`)
})

describe('property management', () => {
  it('creates, lists and updates a property; postcode is normalised', async () => {
    const { id } = await PropertyService.create(hostUserId, base)
    const list = await PropertyService.list(hostUserId)
    expect(list.find((p) => p.id === id)).toMatchObject({ name: 'Harbour View', postcode: 'BS1 4DJ', revenueModel: 'split', splitPropertyPct: 70 })
    await PropertyService.update(hostUserId, id, { ...base, name: 'Harbour View II', revenueModel: 'property' })
    expect(await PropertyService.get(hostUserId, id)).toMatchObject({ name: 'Harbour View II', splitPropertyPct: 100 })
  })

  it("hides a property from other hosts and rejects a split of 100%", async () => {
    const { id } = await PropertyService.create(hostUserId, base)
    await expect(PropertyService.get(otherHostUserId, id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(PropertyService.create(hostUserId, { ...base, splitPropertyPct: 100 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it("only accepts the host's own listings as bays, once", async () => {
    const { id } = await PropertyService.create(hostUserId, base)
    await expect(PropertyService.addBay(hostUserId, id, otherHostListingId, null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await PropertyService.addBay(hostUserId, id, listingId, 'B1')
    await expect(PropertyService.addBay(hostUserId, id, listingId, 'B2')).rejects.toMatchObject({ code: 'BAY_EXISTS' })
    const detail = await PropertyService.get(hostUserId, id)
    expect(detail.bays).toHaveLength(1)
    expect(detail.availableListings.map((l) => l.id)).not.toContain(listingId)
  })
})

describe('resident invites', () => {
  it('must be accepted by the invited email, once', async () => {
    const { id } = await PropertyService.create(hostUserId, base)
    await PropertyService.inviteResident(hostUserId, id, resident.email.toUpperCase(), '12')
    const token = tokenFrom(resident.email.toLowerCase())
    expect(await PropertyService.previewInvite(token)).toMatchObject({ propertyName: 'Harbour View', state: 'valid' })

    await expect(PropertyService.acceptInvite(outsider.userId, token)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await PropertyService.acceptInvite(resident.userId, token)
    await expect(PropertyService.acceptInvite(resident.userId, token)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(PropertyService.inviteResident(hostUserId, id, resident.email, null)).rejects.toMatchObject({ code: 'RESIDENT_EXISTS' })

    const [r] = (await PropertyService.residencies(resident.userId)).filter((x) => x.propertyId === id)
    expect(r).toMatchObject({ unitNumber: '12', residentSharePct: 30 })
  })

  it('rejects expired invites and resending issues a new link', async () => {
    const { id } = await PropertyService.create(hostUserId, base)
    const { id: rid } = await PropertyService.inviteResident(hostUserId, id, resident.email, null)
    const first = tokenFrom(resident.email)
    await PropertyService.resendInvite(hostUserId, id, rid)
    const second = tokenFrom(resident.email)
    expect(second).not.toBe(first)
    await expect(PropertyService.previewInvite(first)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await pg.query(`UPDATE property_residents SET invite_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [rid])
    await expect(PropertyService.acceptInvite(resident.userId, second)).rejects.toMatchObject({ code: 'INVITE_EXPIRED' })
  })

  it('only assigns bays to accepted residents; removal unassigns', async () => {
    const { propertyId, bayId, residentId } = await propertyWithResident()
    const { id: pending } = await PropertyService.inviteResident(hostUserId, propertyId, 'someone@example.com', null)
    await expect(PropertyService.updateBay(hostUserId, propertyId, bayId, { assignedResidentId: pending })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await PropertyService.updateBay(hostUserId, propertyId, bayId, { assignedResidentId: residentId })
    expect((await PropertyService.residencies(resident.userId)).find((r) => r.propertyId === propertyId)?.bays).toHaveLength(1)
    await PropertyService.removeResident(hostUserId, propertyId, residentId)
    expect((await PropertyService.get(hostUserId, propertyId)).bays[0]!.assignedResidentId).toBeNull()
  })
})

describe('booking a bay', () => {
  it('residents_only: blocks the public, residents pay the discounted tariff', async () => {
    await propertyWithResident({ accessMode: 'residents_only', residentDiscountPct: 20 })
    await expect(book(outsider)).rejects.toMatchObject({ code: 'RESIDENTS_ONLY' })
    const b = await book(resident)
    const q = await pg.query<{ quoted_price_per_hour_cents: number }>(`SELECT quoted_price_per_hour_cents FROM bookings WHERE id = $1`, [b.id])
    expect(q.rows[0]!.quoted_price_per_hour_cents).toBe(400)
  })

  it('residents_priority: the public can book only 48 hours ahead', async () => {
    await propertyWithResident({ accessMode: 'residents_priority', residentDiscountPct: 0 })
    await expect(book(outsider, 24 * 5)).rejects.toMatchObject({ code: 'RESIDENT_PRIORITY_WINDOW' })
    await expect(book(outsider, 30)).resolves.toMatchObject({ listingId })
    await expect(book(resident, 24 * 6)).resolves.toMatchObject({ listingId })
  })

  it('public: anyone books at the full price', async () => {
    await propertyWithResident({ accessMode: 'public', residentDiscountPct: 10 })
    const b = await book(outsider, 24 * 8)
    const q = await pg.query<{ quoted_price_per_hour_cents: number }>(`SELECT quoted_price_per_hour_cents FROM bookings WHERE id = $1`, [b.id])
    expect(q.rows[0]!.quoted_price_per_hour_cents).toBe(500)
  })
})

describe('revenue split and archiving', () => {
  async function allocationsFor(bookingId: string) {
    const t = await pg.query<{ id: string }>(`SELECT id FROM transactions WHERE booking_id = $1`, [bookingId])
    const db = await dbModule.getDb()
    await EarningsAllocator.allocateCapture(db, t.rows[0]!.id, 1000)
    const r = await pg.query<{ beneficiary_user_id: string; share: string; amount_pence: number }>(
      `SELECT beneficiary_user_id, share, amount_pence FROM earnings_allocations WHERE transaction_id = $1 ORDER BY share`,
      [t.rows[0]!.id],
    )
    return r.rows
  }

  it("splits a bay's earnings with its resident; archiving returns the listing to the host", async () => {
    const { propertyId, bayId, residentId } = await propertyWithResident({ accessMode: 'public', revenueModel: 'split', splitPropertyPct: 70 })
    await PropertyService.updateBay(hostUserId, propertyId, bayId, { assignedResidentId: residentId })
    const b1 = await book(outsider, 24 * 10)
    expect(await allocationsFor(b1.id)).toEqual([
      { beneficiary_user_id: hostUserId, share: 'property', amount_pence: 700 },
      { beneficiary_user_id: resident.userId, share: 'resident', amount_pence: 300 },
    ])
    expect((await PropertyService.residencies(resident.userId)).find((r) => r.propertyId === propertyId)?.earnedPence).toBe(300)

    await PropertyService.archive(hostUserId, propertyId)
    expect(await PropertyService.list(hostUserId)).not.toContainEqual(expect.objectContaining({ id: propertyId }))
    expect((await PropertyService.residencies(resident.userId)).some((r) => r.propertyId === propertyId)).toBe(false)
    const b2 = await book(outsider, 24 * 11)
    expect(await allocationsFor(b2.id)).toEqual([{ beneficiary_user_id: hostUserId, share: 'host', amount_pence: 1000 }])
  })
})
