/**
 * Wallet payments end to end against the real Postgres schema (PGlite):
 * top-up crediting, booking reservation, settlement, cancellation and refunds.
 * Only the database driver is substituted; all domain logic is production code.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { dbModule, pg, setupDatabase } from '../helpers/pglite-db'
import { WalletService } from '@/domains/payments/WalletService'
import { BookingService } from '@/domains/booking/BookingService'
import { SettlementService } from '@/domains/payments/SettlementService'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { AppError } from '@/lib/errors/AppError'

// Seeded fixtures (db/seeds): an active listing and a driver with a vehicle.
let listingId: string
let driverUserId: string
let vehicleId: string

const STARTING_BALANCE = 5000

async function setWallet(userId: string, balance: number) {
  await pg.query(
    `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO UPDATE SET balance_pence = $2, pending_pence = 0`,
    [userId, balance],
  )
}

/** Successive non-overlapping 1-hour slots a few days out. */
let slotOffsetHours = 72
function nextSlot() {
  const start = new Date(Date.now() + slotOffsetHours * 3_600_000)
  start.setUTCMinutes(0, 0, 0)
  slotOffsetHours += 3
  return { start, end: new Date(start.getTime() + 3_600_000) }
}

function bookWithWallet() {
  const { start, end } = nextSlot()
  return BookingService.create({
    userId: driverUserId, listingId, vehicleId,
    scheduledStart: start, scheduledEnd: end,
    paymentMethodId: null, payWithWallet: true,
  })
}

async function completeSession(bookingId: string, costPence: number): Promise<string> {
  const res = await pg.query<{ id: string }>(
    `INSERT INTO charging_sessions (booking_id, ocpp_charge_point_id, status, total_session_cost_cents)
     VALUES ($1, 'TEST-CP', 'completed', $2) RETURNING id`,
    [bookingId, costPence],
  )
  return res.rows[0]!.id
}

beforeAll(async () => {
  await setupDatabase()
  const r = await pg.query<{ listing: string; du: string; veh: string }>(
    `SELECT cl.id AS listing, dp.user_id AS du, v.id AS veh
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
  vehicleId = f.veh
  // Make slot selection deterministic: instant-book, wide booking limits.
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365 WHERE id = $1`,
    [listingId],
  )
})

beforeEach(async () => {
  await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [driverUserId])
  await setWallet(driverUserId, STARTING_BALANCE)
})

describe('WalletService.topUp', () => {
  it('credits once per PaymentIntent and snapshots the balance in the ledger', async () => {
    await WalletService.topUp(driverUserId, 2000, 'pi_test_once')
    await WalletService.topUp(driverUserId, 2000, 'pi_test_once') // webhook redelivery
    const b = await WalletService.getBalance(driverUserId)
    expect(b.balancePence).toBe(STARTING_BALANCE + 2000)
    const rows = await pg.query<{ balance_after_pence: number }>(
      `SELECT balance_after_pence FROM wallet_transactions WHERE stripe_pi_id = 'pi_test_once'`)
    expect(rows.rows).toEqual([{ balance_after_pence: STARTING_BALANCE + 2000 }])
  })
})

describe('wallet-paid booking', () => {
  it('reserves the estimate at booking without moving money', async () => {
    const booking = await bookWithWallet()
    expect(booking.payWithWallet).toBe(true)
    expect(booking.status).toBe('confirmed')
    const b = await WalletService.getBalance(driverUserId)
    expect(b.balancePence).toBe(STARTING_BALANCE)
    expect(b.pendingPence).toBe(booking.estimatedCostPence)
    expect(b.availablePence).toBe(STARTING_BALANCE - booking.estimatedCostPence)
    const t = await pg.query(
      `SELECT payment_source, status, stripe_payment_intent_id FROM transactions WHERE booking_id = $1`, [booking.id])
    expect(t.rows[0]).toEqual({ payment_source: 'wallet', status: 'hold_placed', stripe_payment_intent_id: null })
  })

  it('rejects with 402 and creates no booking when the wallet is short', async () => {
    await setWallet(driverUserId, 1)
    const before = await pg.query(`SELECT COUNT(*)::INT AS n FROM bookings`)
    const err = await bookWithWallet().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('INSUFFICIENT_WALLET_BALANCE')
    expect((err as AppError).statusCode).toBe(402)
    const after = await pg.query(`SELECT COUNT(*)::INT AS n FROM bookings`)
    expect(after.rows).toEqual(before.rows)
  })

  it('settlement debits the final cost, drops the reservation and allocates earnings', async () => {
    const booking = await bookWithWallet()
    const cost = Math.min(300, booking.estimatedCostPence)
    const sessionId = await completeSession(booking.id, cost)

    expect(await SettlementService.settleSession(sessionId)).toMatchObject({ status: 'captured', amountPence: cost })
    expect(await SettlementService.settleSession(sessionId)).toMatchObject({ status: 'skipped' }) // idempotent

    const b = await WalletService.getBalance(driverUserId)
    expect(b).toMatchObject({ balancePence: STARTING_BALANCE - cost, pendingPence: 0 })
    const ledger = await pg.query(
      `SELECT amount_pence FROM wallet_transactions WHERE booking_id = $1 AND type = 'session_payment'`, [booking.id])
    expect(ledger.rows).toEqual([{ amount_pence: -cost }])
    const alloc = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::INT AS n FROM earnings_allocations ea JOIN transactions t ON t.id = ea.transaction_id
       WHERE t.booking_id = $1`, [booking.id])
    expect(alloc.rows[0]!.n).toBeGreaterThan(0)
    const bk = await pg.query(`SELECT status FROM bookings WHERE id = $1`, [booking.id])
    expect(bk.rows[0]).toEqual({ status: 'completed' })
  })

  it('collects a cost above the reservation from spare wallet balance and pays the host in full', async () => {
    const booking = await bookWithWallet()
    const finalCost = booking.estimatedCostPence + 1000
    const sessionId = await completeSession(booking.id, finalCost)
    expect(await SettlementService.settleSession(sessionId)).toMatchObject({
      status: 'captured', amountPence: booking.estimatedCostPence, shortfallPence: 1000,
    })
    const b = await WalletService.getBalance(driverUserId)
    expect(b).toMatchObject({ balancePence: STARTING_BALANCE - finalCost, pendingPence: 0 })

    const t = await pg.query<{ total_charged_cents: number; host_earnings_cents: number; platform_fee_cents: number }>(
      `SELECT total_charged_cents, host_earnings_cents, platform_fee_cents FROM transactions WHERE booking_id = $1`, [booking.id])
    expect(t.rows[0]!.total_charged_cents).toBe(finalCost)
    expect(t.rows[0]!.host_earnings_cents + t.rows[0]!.platform_fee_cents).toBe(finalCost) // host paid on the full session
    const s = await pg.query(
      `SELECT s.status, s.collected_pence FROM payment_shortfalls s JOIN transactions t ON t.id = s.transaction_id
       WHERE t.booking_id = $1`, [booking.id])
    expect(s.rows[0]).toEqual({ status: 'collected', collected_pence: 1000 })
  })

  it('an unpaid shortfall blocks new bookings until a top-up clears it', async () => {
    const booking = await bookWithWallet()
    // Leave nothing spare in the wallet beyond the reservation.
    await pg.query(`UPDATE wallet_balances SET balance_pence = pending_pence WHERE user_id = $1`, [driverUserId])
    const sessionId = await completeSession(booking.id, booking.estimatedCostPence + 700)
    await SettlementService.settleSession(sessionId)
    expect(await ShortfallService.outstandingPence(driverUserId)).toBe(700)

    const blocked = await bookWithWallet().catch((e: unknown) => e)
    expect((blocked as AppError).code).toBe('OUTSTANDING_BALANCE')

    await WalletService.topUp(driverUserId, 2000, 'pi_test_clears_debt')
    await ShortfallService.collectFromWallet(driverUserId)
    expect(await ShortfallService.outstandingPence(driverUserId)).toBe(0)
    expect((await WalletService.getBalance(driverUserId)).balancePence).toBe(2000 - 700)
    await expect(bookWithWallet()).resolves.toMatchObject({ payWithWallet: true })
  })

  it('a zero-cost session releases the reservation without a debit', async () => {
    const booking = await bookWithWallet()
    const sessionId = await completeSession(booking.id, 0)
    expect(await SettlementService.settleSession(sessionId)).toEqual({ status: 'released' })
    const b = await WalletService.getBalance(driverUserId)
    expect(b).toMatchObject({ balancePence: STARTING_BALANCE, pendingPence: 0 })
  })

  it('cancellation releases the reservation', async () => {
    const booking = await bookWithWallet()
    await BookingService.cancel(booking.id, driverUserId)
    const b = await WalletService.getBalance(driverUserId)
    expect(b).toMatchObject({ balancePence: STARTING_BALANCE, pendingPence: 0 })
    const t = await pg.query(`SELECT status FROM transactions WHERE booking_id = $1`, [booking.id])
    expect(t.rows[0]).toEqual({ status: 'fully_refunded' })
  })

  it('refunds credit the wallet', async () => {
    const booking = await bookWithWallet()
    await dbModule.transaction((tx) => WalletService.refund(tx, driverUserId, booking.id, 250, 'Dispute refund'))
    const b = await WalletService.getBalance(driverUserId)
    expect(b.balancePence).toBe(STARTING_BALANCE + 250)
  })
})
