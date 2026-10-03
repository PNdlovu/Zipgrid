/**
 * Auto top-up, wallet closure on account deletion, and atomic reward
 * redemption against the real schema (PGlite). Stripe is replaced at its API
 * boundary by an in-memory fake; all Zipgrid logic and SQL is production code.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  charges: [] as { amountPence: number; idempotencyKey: string; metadata: Record<string, string> }[],
  refunds: [] as { paymentIntentId: string; amountPence?: number }[],
  declineNext: 0,
}))

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)
vi.mock('@/domains/payments/StripeService', () => ({
  StripeService: {
    isConfigured: () => true,
    isCardError: (e: unknown) => e instanceof Error && 'type' in e && String((e as { type: unknown }).type).startsWith('StripeCard'),
    listPaymentMethods: async () => [{ id: 'pm_test_default', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030, isDefault: true }],
    getDefaultPaymentMethodId: async () => 'pm_test_default',
    chargeOffSession: async (input: { amountPence: number; idempotencyKey: string; metadata: Record<string, string> }) => {
      if (fake.declineNext > 0) {
        fake.declineNext--
        throw Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' })
      }
      fake.charges.push(input)
      return { paymentIntentId: `pi_fake_${fake.charges.length}_${input.idempotencyKey}`, status: 'succeeded' }
    },
    cancelPaymentIntent: async () => ({}),
    refund: async (input: { paymentIntentId: string; amountPence?: number }) => { fake.refunds.push(input); return {} },
  },
}))

import { pg, setupDatabase } from '../helpers/pglite-db'
import { WalletService } from '@/domains/payments/WalletService'
import { AutoTopupService, MAX_AUTO_TOPUPS_PER_DAY } from '@/domains/payments/AutoTopupService'
import { WalletClosureService } from '@/domains/payments/WalletClosureService'
import { BookingService } from '@/domains/booking/BookingService'
import { RewardsService } from '@/domains/rewards/RewardsService'

let userId: string
let listingId: string
let vehicleId: string

async function resetWallet(balance: number, autoTopup: boolean) {
  await pg.query(`DELETE FROM wallet_auto_topups WHERE user_id = $1`, [userId])
  await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [userId])
  await pg.query(
    `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence, auto_topup_enabled,
                                  auto_topup_threshold_pence, auto_topup_amount_pence, auto_topup_failures)
     VALUES ($1, $2, 0, $3, 500, 2000, 0)
     ON CONFLICT (user_id) DO UPDATE SET balance_pence = $2, pending_pence = 0, auto_topup_enabled = $3,
       auto_topup_threshold_pence = 500, auto_topup_amount_pence = 2000, auto_topup_failures = 0`,
    [userId, balance, autoTopup],
  )
}

let slotOffsetHours = 72
function nextSlot() {
  const start = new Date(Date.now() + slotOffsetHours * 3_600_000)
  start.setUTCMinutes(0, 0, 0)
  slotOffsetHours += 3
  return { start, end: new Date(start.getTime() + 3_600_000) }
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
  userId = f.du
  vehicleId = f.veh
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365 WHERE id = $1`,
    [listingId],
  )
  await pg.query(`UPDATE users SET stripe_customer_id = 'cus_test' WHERE id = $1`, [userId])
})

beforeEach(() => {
  fake.charges.length = 0
  fake.refunds.length = 0
  fake.declineNext = 0
})

describe('auto top-up', () => {
  it('tops up a short wallet at booking time so the booking goes through', async () => {
    await resetWallet(0, true)
    const { start, end } = nextSlot()
    const booking = await BookingService.create({
      userId, listingId, vehicleId, scheduledStart: start, scheduledEnd: end,
      paymentMethodId: null, payWithWallet: true,
    })
    expect(fake.charges).toHaveLength(1)
    const charged = fake.charges[0]!.amountPence
    expect(charged).toBeGreaterThanOrEqual(Math.max(2000, booking.estimatedCostPence))
    expect(fake.charges[0]!.metadata).toMatchObject({ purpose: 'wallet_topup', user_id: userId })
    const b = await WalletService.getBalance(userId)
    expect(b).toMatchObject({ balancePence: charged, pendingPence: booking.estimatedCostPence })
  })

  it('without auto top-up a short wallet still fails with 402 and charges nothing', async () => {
    await resetWallet(0, false)
    const { start, end } = nextSlot()
    const err = await BookingService.create({
      userId, listingId, vehicleId, scheduledStart: start, scheduledEnd: end,
      paymentMethodId: null, payWithWallet: true,
    }).catch((e: unknown) => e)
    expect((err as { code: string }).code).toBe('INSUFFICIENT_WALLET_BALANCE')
    expect(fake.charges).toHaveLength(0)
  })

  it('tops up by the configured amount when a debit leaves the balance under the threshold', async () => {
    await resetWallet(300, true) // threshold 500
    await AutoTopupService.afterDebit(userId)
    expect(fake.charges.map((c) => c.amountPence)).toEqual([2000])
    expect((await WalletService.getBalance(userId)).balancePence).toBe(2300)
  })

  it(`stops after ${MAX_AUTO_TOPUPS_PER_DAY} successful top-ups in 24 hours`, async () => {
    await resetWallet(0, true)
    for (let i = 0; i < MAX_AUTO_TOPUPS_PER_DAY + 2; i++) {
      await pg.query(`UPDATE wallet_balances SET balance_pence = 0 WHERE user_id = $1`, [userId])
      await AutoTopupService.afterDebit(userId)
    }
    expect(fake.charges).toHaveLength(MAX_AUTO_TOPUPS_PER_DAY)
  })

  it('notifies on a decline and switches itself off after two in a row', async () => {
    await resetWallet(0, true)
    fake.declineNext = 2
    expect(await AutoTopupService.run(userId, 2000, 'low_balance')).toBe('failed')
    expect((await WalletService.getBalance(userId)).autoTopupEnabled).toBe(true)
    expect(await AutoTopupService.run(userId, 2000, 'low_balance')).toBe('failed')
    expect((await WalletService.getBalance(userId)).autoTopupEnabled).toBe(false)

    const n = await pg.query<{ title: string }>(
      `SELECT title FROM notifications WHERE user_id = $1 AND category = 'payment_issue' ORDER BY created_at`, [userId])
    expect(n.rows.map((r) => r.title).slice(-2)).toEqual(['Auto top-up failed', 'Auto top-up turned off'])
  })
})

describe('wallet closure on account deletion', () => {
  it('refunds top-up cash to the card (newest first) and forfeits non-cash credit', async () => {
    await resetWallet(0, false)
    await pg.query(`DELETE FROM wallet_transactions WHERE user_id = $1`, [userId])
    await WalletService.topUp(userId, 1000, 'pi_old')
    await new Promise((r) => setTimeout(r, 5))
    await WalletService.topUp(userId, 2000, 'pi_new')
    const { dbModule } = await import('../helpers/pglite-db')
    await dbModule.transaction((tx) => WalletService.creditRewardRedemption(tx, userId, 500, 'Reward redemption'))
    // 3500 credited (3000 cash + 500 rewards); simulate 1200 spent on sessions.
    // Refunds favour the driver: the 2300 left is all treated as cash.
    await pg.query(`UPDATE wallet_balances SET balance_pence = 2300 WHERE user_id = $1`, [userId])

    const result = await WalletClosureService.close(userId)
    expect(result).toEqual({ refundedPence: 2300, forfeitedPence: 0 })
    expect(fake.refunds).toEqual([
      expect.objectContaining({ paymentIntentId: 'pi_new', amountPence: 2000 }),
      expect.objectContaining({ paymentIntentId: 'pi_old', amountPence: 300 }),
    ])
    expect((await WalletService.getBalance(userId)).balancePence).toBe(0)
  })

  it('forfeits credit that did not come from a card top-up', async () => {
    await resetWallet(0, false)
    await pg.query(`DELETE FROM wallet_transactions WHERE user_id = $1`, [userId])
    const { dbModule } = await import('../helpers/pglite-db')
    await dbModule.transaction((tx) => WalletService.creditRewardRedemption(tx, userId, 800, 'Reward redemption'))
    expect(await WalletClosureService.close(userId)).toEqual({ refundedPence: 0, forfeitedPence: 800 })
    expect(fake.refunds).toHaveLength(0)
  })

  it('refuses to close while funds are reserved for a booking', async () => {
    await resetWallet(5000, false)
    const { start, end } = nextSlot()
    await BookingService.create({
      userId, listingId, vehicleId, scheduledStart: start, scheduledEnd: end,
      paymentMethodId: null, payWithWallet: true,
    })
    await expect(WalletClosureService.close(userId)).rejects.toThrow(/reserved/)
  })
})

describe('reward redemption', () => {
  it('debits points and credits the wallet together, and cannot overspend', async () => {
    await resetWallet(0, false)
    await RewardsService.getBalance(userId)
    await pg.query(
      `INSERT INTO reward_points (user_id, action, points, multiplier, description)
       VALUES ($1, 'welcome_bonus', 1000, 1.0, 'test grant')`,
      [userId],
    )
    const before = (await RewardsService.getBalance(userId)).totalPoints
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => RewardsService.redeem(userId, before)),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await RewardsService.getBalance(userId)).totalPoints).toBe(0)
    const credit = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ walletCreditPence: number }>).value
    expect((await WalletService.getBalance(userId)).balancePence).toBe(credit.walletCreditPence)
  })
})
