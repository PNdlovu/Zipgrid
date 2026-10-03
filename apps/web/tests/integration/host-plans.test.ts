/**
 * Host plans against the real schema (PGlite): Stripe subscription sync,
 * commission snapshot + settlement split, listing limits and feature gates.
 * Stripe subscription objects are plain fixtures; no Stripe calls are made.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

import { pg, setupDatabase } from '../helpers/pglite-db'
import { HostPlanService, PlanUpgradeRequiredError } from '@/domains/billing/HostPlanService'
import { ListingService } from '@/domains/charging/ListingService'
import { BookingService } from '@/domains/booking/BookingService'
import { SettlementService } from '@/domains/payments/SettlementService'

process.env['STRIPE_PRICE_GROWTH_MONTHLY'] = 'price_growth_monthly'
process.env['STRIPE_PRICE_PRO_ANNUAL'] = 'price_pro_annual'

let hostUserId: string
let hostProfileId: string
let listingId: string
let driverUserId: string
let vehicleId: string

function subscription(overrides: { id?: string; status: Stripe.Subscription.Status; price: string; cancelAtPeriodEnd?: boolean }): Stripe.Subscription {
  return {
    id: overrides.id ?? 'sub_test_1',
    status: overrides.status,
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
    metadata: { host_profile_id: hostProfileId },
    items: { data: [{ id: 'si_1', price: { id: overrides.price } }] },
  } as unknown as Stripe.Subscription
}

async function hostRow() {
  const r = await pg.query<{ platform_tier: string; commission_rate_pct: string; stripe_subscription_id: string | null; subscription_cancel_at_period_end: boolean }>(
    `SELECT platform_tier, commission_rate_pct, stripe_subscription_id, subscription_cancel_at_period_end
     FROM host_profiles WHERE id = $1`, [hostProfileId])
  return { ...r.rows[0]!, commission: Number(r.rows[0]!.commission_rate_pct) }
}

beforeAll(async () => {
  await setupDatabase()
  const r = await pg.query<{ listing: string; hp: string; hu: string; du: string; veh: string }>(
    `SELECT cl.id AS listing, hp.id AS hp, hp.user_id AS hu, dp.user_id AS du, v.id AS veh
     FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
     CROSS JOIN driver_profiles dp JOIN driver_vehicles v ON v.driver_profile_id = dp.id
     WHERE cl.status = 'active' AND hp.user_id <> dp.user_id LIMIT 1`,
  )
  const f = r.rows[0]!
  listingId = f.listing; hostProfileId = f.hp; hostUserId = f.hu; driverUserId = f.du; vehicleId = f.veh
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365 WHERE id = $1`, [listingId])
})

beforeEach(async () => {
  await pg.query(
    `UPDATE host_profiles SET platform_tier = 'starter', commission_rate_pct = 15, stripe_subscription_id = NULL,
            subscription_status = NULL, subscription_cancel_at_period_end = FALSE WHERE id = $1`, [hostProfileId])
})

describe('Stripe subscription sync', () => {
  it('an active Growth subscription moves the host to Growth at 12%', async () => {
    expect(await HostPlanService.syncSubscription(subscription({ status: 'active', price: 'price_growth_monthly' }))).toBe(true)
    expect(await hostRow()).toMatchObject({ platform_tier: 'growth', commission: 12, stripe_subscription_id: 'sub_test_1' })
    const status = await HostPlanService.getStatus(hostUserId)
    expect(status).toMatchObject({ tier: 'growth', interval: 'monthly', status: 'active', hasSubscription: true })
  })

  it('keeps the paid plan while a payment is past due, and falls back to Starter once cancelled', async () => {
    await HostPlanService.syncSubscription(subscription({ status: 'active', price: 'price_pro_annual' }))
    await HostPlanService.syncSubscription(subscription({ status: 'past_due', price: 'price_pro_annual' }))
    expect(await hostRow()).toMatchObject({ platform_tier: 'pro', commission: 8 })
    await HostPlanService.syncSubscription(subscription({ status: 'canceled', price: 'price_pro_annual' }))
    expect(await hostRow()).toMatchObject({ platform_tier: 'starter', commission: 15, stripe_subscription_id: null })
  })

  it('records a scheduled cancellation without changing the plan', async () => {
    await HostPlanService.syncSubscription(subscription({ status: 'active', price: 'price_growth_monthly', cancelAtPeriodEnd: true }))
    expect(await hostRow()).toMatchObject({ platform_tier: 'growth', subscription_cancel_at_period_end: true })
  })

  it('ignores subscriptions that belong to no host', async () => {
    const sub = subscription({ id: 'sub_unknown', status: 'active', price: 'price_growth_monthly' })
    sub.metadata = {}
    expect(await HostPlanService.syncSubscription(sub)).toBe(false)
  })
})

describe('commission', () => {
  it('snapshots the host plan rate on the booking and splits revenue at it', async () => {
    await HostPlanService.syncSubscription(subscription({ status: 'active', price: 'price_pro_annual' })) // 8%
    await pg.query(
      `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, 20000, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance_pence = 20000, pending_pence = 0`, [driverUserId])
    await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [driverUserId])
    const start = new Date(Date.now() + 5 * 86_400_000)
    start.setUTCMinutes(0, 0, 0)
    const booking = await BookingService.create({
      userId: driverUserId, listingId, vehicleId, scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 3_600_000), paymentMethodId: null, payWithWallet: true,
    })
    const t = await pg.query<{ commission_rate_pct: string }>(`SELECT commission_rate_pct FROM transactions WHERE booking_id = $1`, [booking.id])
    expect(Number(t.rows[0]!.commission_rate_pct)).toBe(8)

    const cost = Math.min(1000, booking.estimatedCostPence)
    const s = await pg.query<{ id: string }>(
      `INSERT INTO charging_sessions (booking_id, ocpp_charge_point_id, status, total_session_cost_cents)
       VALUES ($1, 'TEST-CP', 'completed', $2) RETURNING id`, [booking.id, cost])
    await SettlementService.settleSession(s.rows[0]!.id)
    const settled = await pg.query<{ platform_fee_cents: number; host_earnings_cents: number }>(
      `SELECT platform_fee_cents, host_earnings_cents FROM transactions WHERE booking_id = $1`, [booking.id])
    expect(settled.rows[0]).toEqual({ platform_fee_cents: Math.round(cost * 0.08), host_earnings_cents: cost - Math.round(cost * 0.08) })
  })
})

describe('plan enforcement', () => {
  it('blocks a Starter host from adding a 4th listing', async () => {
    const count = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::INT AS n FROM charger_listings WHERE host_profile_id = $1 AND status <> 'deactivated'`, [hostProfileId])
    const base = {
      hostProfileId, title: 'Limit test', addressLine1: '1 Test St', city: 'London', postcode: 'SW1A 1AA',
      latitude: 51.5, longitude: -0.12, chargerLevel: 'level_2', plugTypes: ['Type2'], maxPowerKw: 7,
      pricingModel: 'per_kwh', pricePerKwhPence: 30,
    } as Parameters<typeof ListingService.create>[0]
    for (let i = count.rows[0]!.n; i < 3; i++) await ListingService.create(base)
    await expect(ListingService.create(base)).rejects.toBeInstanceOf(PlanUpgradeRequiredError)

    await HostPlanService.syncSubscription(subscription({ status: 'active', price: 'price_growth_monthly' }))
    await expect(ListingService.create(base)).resolves.toMatchObject({ title: 'Limit test' })
  })

  it('gates features by plan', async () => {
    await expect(HostPlanService.requireFeature(hostUserId, 'analytics')).rejects.toThrow(/Growth plan/)
    await HostPlanService.syncSubscription(subscription({ status: 'active', price: 'price_growth_monthly' }))
    await expect(HostPlanService.requireFeature(hostUserId, 'analytics')).resolves.toBeUndefined()
    await expect(HostPlanService.requireFeature(hostUserId, 'vat_invoices')).rejects.toThrow(/Pro plan/)
  })

  it('downgrading to Starter without a subscription applies immediately', async () => {
    await pg.query(`UPDATE host_profiles SET platform_tier = 'growth', commission_rate_pct = 12 WHERE id = $1`, [hostProfileId])
    expect(await HostPlanService.changePlan(hostUserId, 'starter', 'monthly', 'https://app.test')).toEqual({ action: 'updated', tier: 'starter' })
    expect(await hostRow()).toMatchObject({ platform_tier: 'starter', commission: 15 })
  })
})
