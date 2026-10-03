/**
 * Resolution Centre cases and damage recovery against the real schema (PGlite):
 * either party can open a case, the damage reporting window, the session
 * snapshot and acknowledgement deadline, and recovering an upheld damage claim
 * from the driver (wallet first) with the host credited in full.
 * Also covers policy acceptance records.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { dbModule, pg, setupDatabase } from '../helpers/pglite-db'
import { BookingService } from '@/domains/booking/BookingService'
import { SettlementService } from '@/domains/payments/SettlementService'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { WalletService } from '@/domains/payments/WalletService'
import { DisputeService, MAX_DAMAGE_CHARGE_PENCE } from '@/domains/trust/DisputeService'
import { PolicyService, policiesForRoles, POLICIES } from '@/domains/compliance/PolicyService'
import { AppError } from '@/lib/errors/AppError'

let listingId: string
let driverUserId: string
let hostUserId: string
let vehicleId: string
let outsiderUserId: string

let slotOffsetHours = 400
function nextSlot() {
  const start = new Date(Date.now() + slotOffsetHours * 3_600_000)
  start.setUTCMinutes(0, 0, 0)
  slotOffsetHours += 3
  return { start, end: new Date(start.getTime() + 3_600_000) }
}

async function setWallet(userId: string, balance: number) {
  await pg.query(
    `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO UPDATE SET balance_pence = $2, pending_pence = 0`,
    [userId, balance],
  )
}

/** A wallet-paid booking that has been charged and settled (status completed). */
async function completedBooking(): Promise<string> {
  const { start, end } = nextSlot()
  const booking = await BookingService.create({
    userId: driverUserId, listingId, vehicleId, scheduledStart: start, scheduledEnd: end,
    paymentMethodId: null, payWithWallet: true,
  })
  const s = await pg.query<{ id: string }>(
    `INSERT INTO charging_sessions (booking_id, ocpp_charge_point_id, status, total_session_cost_cents,
                                    started_at, ended_at, meter_start_wh, meter_stop_wh, stop_reason)
     VALUES ($1, 'TEST-CP', 'completed', 300, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', 0, 7400, 'EVDisconnected')
     RETURNING id`,
    [booking.id],
  )
  await SettlementService.settleSession(s.rows[0]!.id)
  return booking.id
}

async function addEvidence(disputeId: string, userId: string) {
  await pg.query(
    `INSERT INTO dispute_evidence (dispute_id, file_url, file_name, file_type, file_size_bytes, uploaded_by_user_id)
     VALUES ($1, 'https://example.test/quote.pdf', 'quote.pdf', 'application/pdf', 1000, $2)`,
    [disputeId, userId],
  )
}

const code = (e: unknown) => (e as AppError).code

beforeAll(async () => {
  await setupDatabase()
  const r = await pg.query<{ listing: string; du: string; hu: string; veh: string }>(
    `SELECT cl.id AS listing, dp.user_id AS du, hp.user_id AS hu, v.id AS veh
     FROM charger_listings cl
     JOIN host_profiles hp ON hp.id = cl.host_profile_id
     CROSS JOIN driver_profiles dp
     JOIN driver_vehicles v ON v.driver_profile_id = dp.id
     WHERE cl.status = 'active' AND hp.user_id <> dp.user_id
     LIMIT 1`,
  )
  const f = r.rows[0]!
  listingId = f.listing
  driverUserId = f.du
  hostUserId = f.hu
  vehicleId = f.veh
  const o = await pg.query<{ id: string }>(
    `SELECT id FROM users WHERE id NOT IN ($1, $2) LIMIT 1`, [driverUserId, hostUserId])
  outsiderUserId = o.rows[0]!.id
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365 WHERE id = $1`,
    [listingId],
  )
})

beforeEach(async () => {
  await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [driverUserId])
  await setWallet(driverUserId, 50_000)
})

describe('opening a case', () => {
  it('lets the host open a damage case by short reference, raised against the driver, with a snapshot', async () => {
    const bookingId = await completedBooking()
    const d = await DisputeService.open({
      userId: hostUserId, disputeType: 'property_damage',
      description: 'The cable holster was snapped off the wall.', bookingRef: bookingId.slice(0, 8).toUpperCase(),
    })
    expect(d).toMatchObject({ raisedBy: 'host', raisedByUserId: hostUserId, raisedAgainstUserId: driverUserId, bookingId, status: 'open' })

    const row = await pg.query<{ snap: Record<string, unknown>; hours: number }>(
      `SELECT session_snapshot AS snap, EXTRACT(EPOCH FROM (acknowledge_by - created_at)) / 3600 AS hours
       FROM disputes WHERE id = $1`, [d.id])
    expect(Math.round(Number(row.rows[0]!.hours))).toBe(24)
    expect(row.rows[0]!.snap).toMatchObject({ booking_id: bookingId, energy_consumed_wh: 7400, stop_reason: 'EVDisconnected' })

    const dup = await DisputeService.open({
      userId: hostUserId, disputeType: 'property_damage', description: 'Same booking again please.', bookingRef: bookingId,
    }).catch((e: unknown) => e)
    expect(code(dup)).toBe('DUPLICATE_DISPUTE')
  })

  it('gives safety problems a 1-hour acknowledgement deadline and notifies the other party', async () => {
    const bookingId = await completedBooking()
    const d = await DisputeService.open({
      userId: driverUserId, disputeType: 'safety_incident', description: 'Sparks from the connector when plugging in.', bookingRef: bookingId,
    })
    expect(d).toMatchObject({ raisedBy: 'driver', raisedAgainstUserId: hostUserId })
    const row = await pg.query<{ hours: number }>(
      `SELECT EXTRACT(EPOCH FROM (acknowledge_by - created_at)) / 3600 AS hours FROM disputes WHERE id = $1`, [d.id])
    expect(Math.round(Number(row.rows[0]!.hours))).toBe(1)
    const n = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::INT AS n FROM notifications WHERE user_id = $1 AND body LIKE $2`,
      [hostUserId, `%#${d.id.slice(0, 8).toUpperCase()}%`])
    expect(n.rows[0]!.n).toBeGreaterThan(0)
  })

  it('rejects people who are not party to the booking', async () => {
    const bookingId = await completedBooking()
    const err = await DisputeService.open({
      userId: outsiderUserId, disputeType: 'other', description: 'Not my booking at all.', bookingRef: bookingId,
    }).catch((e: unknown) => e)
    expect(code(err)).toBe('NOT_FOUND')
  })

  it('closes the damage reporting window 14 days after the booking ends', async () => {
    const bookingId = await completedBooking()
    await pg.query(`UPDATE charging_sessions SET ended_at = NOW() - INTERVAL '15 days' WHERE booking_id = $1`, [bookingId])
    const err = await DisputeService.open({
      userId: hostUserId, disputeType: 'property_damage', description: 'Found damage much later.', bookingRef: bookingId,
    }).catch((e: unknown) => e)
    expect(code(err)).toBe('REPORTING_WINDOW_CLOSED')
  })
})

describe('damage recovery', () => {
  async function hostDamageCase() {
    const bookingId = await completedBooking()
    const d = await DisputeService.open({
      userId: hostUserId, disputeType: 'property_damage', description: 'Connector cracked during the session.', bookingRef: bookingId,
    })
    return { bookingId, disputeId: d.id }
  }

  it('requires evidence, a host-raised damage case and an amount within the limit', async () => {
    const { disputeId } = await hostDamageCase()
    const noEvidence = await dbModule.transaction((tx) => DisputeService.openDamageCharge(tx, disputeId, 1500)).catch((e: unknown) => e)
    expect(noEvidence).toBeInstanceOf(AppError)
    await addEvidence(disputeId, hostUserId)
    const tooMuch = await dbModule.transaction((tx) =>
      DisputeService.openDamageCharge(tx, disputeId, MAX_DAMAGE_CHARGE_PENCE + 1)).catch((e: unknown) => e)
    expect(code(tooMuch)).toBe('DAMAGE_OVER_LIMIT')

    const bookingId = await completedBooking()
    const driverCase = await DisputeService.open({
      userId: driverUserId, disputeType: 'property_damage', description: 'Charger scratched my car door.', bookingRef: bookingId,
    })
    await addEvidence(driverCase.id, driverUserId)
    const wrongSide = await dbModule.transaction((tx) => DisputeService.openDamageCharge(tx, driverCase.id, 1500)).catch((e: unknown) => e)
    expect(wrongSide).toBeInstanceOf(AppError)
  })

  it('collects from the driver’s wallet and credits the host in full without touching the session totals', async () => {
    const { bookingId, disputeId } = await hostDamageCase()
    await addEvidence(disputeId, hostUserId)
    const before = await pg.query<{ total_charged_cents: number }>(
      `SELECT total_charged_cents FROM transactions WHERE booking_id = $1`, [bookingId])
    const walletBefore = (await WalletService.getBalance(driverUserId)).balancePence

    const shortfallId = await dbModule.transaction((tx) => DisputeService.openDamageCharge(tx, disputeId, 1500))
    expect(await ShortfallService.outstandingPence(driverUserId)).toBe(1500)
    expect(await ShortfallService.collect(shortfallId, { useCard: false })).toBe(0)

    expect((await WalletService.getBalance(driverUserId)).balancePence).toBe(walletBefore - 1500)
    const ledger = await pg.query(
      `SELECT amount_pence FROM wallet_transactions
       WHERE user_id = $1 AND booking_id = $2 AND type = 'shortfall_payment' AND description = 'Damage charge'`,
      [driverUserId, bookingId])
    expect(ledger.rows).toEqual([{ amount_pence: -1500 }])

    const alloc = await pg.query(
      `SELECT ea.beneficiary_user_id, ea.share, ea.amount_pence FROM earnings_allocations ea
       JOIN transactions t ON t.id = ea.transaction_id
       WHERE t.booking_id = $1 AND ea.reason LIKE 'damage:%'`, [bookingId])
    expect(alloc.rows).toEqual([{ beneficiary_user_id: hostUserId, share: 'host', amount_pence: 1500 }])

    const after = await pg.query(`SELECT total_charged_cents FROM transactions WHERE booking_id = $1`, [bookingId])
    expect(after.rows).toEqual(before.rows)
    const d = await DisputeService.get(disputeId)
    expect(d.damageChargePence).toBe(1500)

    const again = await dbModule.transaction((tx) => DisputeService.openDamageCharge(tx, disputeId, 100)).catch((e: unknown) => e)
    expect(code(again)).toBe('DAMAGE_ALREADY_CHARGED')
  })

  it('an unpaid damage charge blocks new bookings', async () => {
    const { disputeId } = await hostDamageCase()
    await addEvidence(disputeId, hostUserId)
    await setWallet(driverUserId, 0)
    const shortfallId = await dbModule.transaction((tx) => DisputeService.openDamageCharge(tx, disputeId, 2000))
    expect(await ShortfallService.collect(shortfallId, { useCard: false })).toBe(2000)

    const { start, end } = nextSlot()
    const blocked = await BookingService.create({
      userId: driverUserId, listingId, vehicleId, scheduledStart: start, scheduledEnd: end,
      paymentMethodId: null, payWithWallet: true,
    }).catch((e: unknown) => e)
    expect(code(blocked)).toBe('OUTSTANDING_BALANCE')
  })
})

describe('policy acceptance', () => {
  it('asks each role for the right policies', () => {
    expect(policiesForRoles(['driver'])).toEqual(['terms', 'privacy', 'driver_terms'])
    expect(policiesForRoles(['driver', 'host'])).toEqual(['terms', 'privacy', 'driver_terms', 'host_terms'])
  })

  it('records the current version once, ignoring an unusable IP', async () => {
    await PolicyService.recordAcceptance(outsiderUserId, ['terms', 'host_terms'], { ip: 'unknown', userAgent: 'vitest' })
    await PolicyService.recordAcceptance(outsiderUserId, ['terms'], { ip: '203.0.113.9' })
    const rows = await PolicyService.listForUser(outsiderUserId)
    expect(rows.map((r) => [r.policy, r.version]).sort()).toEqual([
      ['host_terms', POLICIES.host_terms.version],
      ['terms', POLICIES.terms.version],
    ])
  })
})
