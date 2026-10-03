/**
 * The AI concierge against the real schema (PGlite), with Claude replaced by
 * a scripted fake: tools run as the user, a quoted booking can't be confirmed
 * in the turn it was quoted, it books after the user's yes, history persists,
 * and refusals are handled.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Sdk from '@anthropic-ai/sdk'

vi.mock('@/lib/db', async () => (await import('../helpers/pglite-db')).dbModule)

type Params = { messages: { role: string; content: unknown }[] }
type Scripted = (params: Params) => object
const script: Scripted[] = []
const calls: Params[] = []

vi.mock('@anthropic-ai/sdk', async (orig) => {
  const real = await orig<typeof Sdk>()
  const Base = real.default
  class FakeAnthropic extends Base {
    override beta = {
      messages: {
        create: async (params: Params) => {
          calls.push(structuredClone(params))
          const next = script.shift()
          if (!next) throw new Error('script exhausted')
          return next(params)
        },
      },
    } as unknown as InstanceType<typeof Base>['beta']
  }
  return { ...real, default: FakeAnthropic }
})

import { pg, setupDatabase } from '../helpers/pglite-db'
import { ConciergeService } from '@/domains/concierge/ConciergeService'
import { runTool } from '@/domains/concierge/tools'

let driver: { userId: string; vehicleId: string }
let otherDriverId: string
let listingId: string
let hostUserId: string

const msg = (content: object[], stop_reason: string) => ({
  id: `msg_${Math.random()}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content, stop_reason, stop_details: null, usage: { input_tokens: 1, output_tokens: 1 },
})
const say = (text: string): Scripted => () => msg([{ type: 'text', text }], 'end_turn')
const use = (name: string, input: object | ((p: Params) => object)): Scripted => (p) =>
  msg([{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2)}`, name, input: typeof input === 'function' ? input(p) : input }], 'tool_use')

/** The last tool result Claude was sent, parsed. */
function lastToolResult(p: Params): { content: string; is_error?: boolean } {
  const last = p.messages[p.messages.length - 1]!
  const block = (last.content as { type: string; content: string; is_error?: boolean }[]).find((b) => b.type === 'tool_result')!
  return block
}

function slot(hoursAhead: number) {
  const start = new Date(Date.now() + hoursAhead * 3_600_000)
  start.setUTCMinutes(0, 0, 0)
  return { start: start.toISOString(), end: new Date(start.getTime() + 2 * 3_600_000).toISOString() }
}

beforeAll(async () => {
  process.env['ANTHROPIC_API_KEY'] = 'test-key'
  await setupDatabase()
  const l = await pg.query<{ id: string; hu: string }>(
    `SELECT cl.id, hp.user_id AS hu FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
     WHERE cl.status = 'active' ORDER BY cl.id LIMIT 1`,
  )
  listingId = l.rows[0]!.id
  hostUserId = l.rows[0]!.hu
  await pg.query(
    `UPDATE charger_listings SET instant_book_enabled = TRUE, min_booking_hours = 0, max_booking_hours = 24,
            advance_booking_days = 365, pricing_model = 'per_hour', price_per_hour_cents = 500
     WHERE id = $1`,
    [listingId],
  )
  const d = await pg.query<{ uid: string; veh: string }>(
    `SELECT DISTINCT ON (u.id) u.id AS uid, v.id AS veh
     FROM users u JOIN driver_profiles dp ON dp.user_id = u.id JOIN driver_vehicles v ON v.driver_profile_id = dp.id
     WHERE u.id <> $1 ORDER BY u.id LIMIT 2`,
    [l.rows[0]!.hu],
  )
  if (d.rows.length < 2) throw new Error('seed data needs two drivers with vehicles')
  driver = { userId: d.rows[0]!.uid, vehicleId: d.rows[0]!.veh }
  otherDriverId = d.rows[1]!.uid
  for (const u of [driver.userId, otherDriverId]) {
    await pg.query(
      `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence) VALUES ($1, 100000, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance_pence = 100000, pending_pence = 0`,
      [u],
    )
    await pg.query(`DELETE FROM payment_shortfalls WHERE user_id = $1`, [u])
  }
})

beforeEach(() => {
  script.length = 0
  calls.length = 0
})

const ctxFor = (userId: string) => ({ userId, conversationId: '00000000-0000-0000-0000-000000000000', turn: 1, location: null })

describe('concierge tools', () => {
  it('finds chargers near coordinates and returns a trust report', async () => {
    const at = await pg.query<{ latitude: number; longitude: number }>(`SELECT latitude, longitude FROM charger_listings WHERE id = $1`, [listingId])
    const found = await runTool('find_chargers', { lat: Number(at.rows[0]!.latitude), lng: Number(at.rows[0]!.longitude), radius_km: 5 }, ctxFor(driver.userId))
    expect(found.isError).toBe(false)
    expect(JSON.parse(found.content).chargers.map((c: { listingId: string }) => c.listingId)).toContain(listingId)

    const details = await runTool('get_charger_details', { listing_id: listingId }, ctxFor(driver.userId))
    expect(details.isError).toBe(false)
    expect(JSON.parse(details.content).trust).toMatchObject({ superhost: expect.any(Boolean), recentReviews: expect.any(Array) })
  })

  it('rejects bad input and unknown tools as tool errors', async () => {
    expect((await runTool('quote_booking', { listing_id: 'nope' }, ctxFor(driver.userId))).isError).toBe(true)
    expect((await runTool('drop_tables', {}, ctxFor(driver.userId))).isError).toBe(true)
    const noLocation = await runTool('find_chargers', {}, ctxFor(driver.userId))
    expect(noLocation).toMatchObject({ isError: true, content: expect.stringMatching(/No location/) })
  })
})

describe('concierge conversation', () => {
  it("won't book in the turn it quoted; books after the user's yes", async () => {
    const s = slot(30)
    const before = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bookings WHERE listing_id = $1`, [listingId])

    // Turn 1: quote, then (wrongly) try to confirm straight away, then ask.
    script.push(
      use('quote_booking', { listing_id: listingId, vehicle_id: driver.vehicleId, ...s }),
      use('confirm_action', (p) => ({ action_id: JSON.parse(lastToolResult(p).content).actionId })),
      (p) => {
        expect(lastToolResult(p)).toMatchObject({ is_error: true, content: expect.stringMatching(/not confirmed/) })
        return say('That will be about £10 from your wallet. Shall I book it?')(p)
      },
    )
    const t1 = await ConciergeService.send({ userId: driver.userId, conversationId: null, message: 'Book me a charger tomorrow', location: null })
    expect(t1.pendingActions).toHaveLength(1)
    expect(t1.pendingActions[0]!.summary).toMatch(/^Book .* paid from your wallet/)
    expect(t1.completedActions).toEqual([])
    const mid = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bookings WHERE listing_id = $1`, [listingId])
    expect(mid.rows[0]!['n']).toBe(before.rows[0]!['n'])

    // Turn 2: the user says yes; the same action now goes through.
    const actionId = t1.pendingActions[0]!.actionId
    script.push(use('confirm_action', { action_id: actionId }), (p) => {
      expect(JSON.parse(lastToolResult(p).content)).toMatchObject({ booked: true, status: 'confirmed', arrivalCode: expect.any(String) })
      return say('Booked. Your arrival code is in the app.')(p)
    })
    const t2 = await ConciergeService.send({ userId: driver.userId, conversationId: t1.conversationId, message: 'Yes please', location: null })
    expect(t2.completedActions).toEqual([{ kind: 'booked', summary: expect.stringMatching(/^Booked/) }])
    const after = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bookings WHERE listing_id = $1`, [listingId])
    expect(after.rows[0]!['n']).toBe(Number(before.rows[0]!['n']) + 1)

    // Confirming twice does nothing more.
    expect((await runTool('confirm_action', { action_id: actionId }, { ...ctxFor(driver.userId), conversationId: t1.conversationId, turn: 5 })).content)
      .toMatch(/already executed/)

    // The second request carried the whole first turn, append-only.
    const turn2First = calls[calls.length - 2]!
    expect(turn2First.messages.length).toBeGreaterThan(6)
    expect(JSON.stringify(turn2First.messages[0])).toContain('Book me a charger tomorrow')

    const latest = await ConciergeService.latest(driver.userId)
    expect(latest.conversationId).toBe(t1.conversationId)
    expect(latest.lines.map((l) => l.text)).toEqual([
      'Book me a charger tomorrow',
      'That will be about £10 from your wallet. Shall I book it?',
      'Yes please',
      'Booked. Your arrival code is in the app.',
    ])
  })

  it("can't confirm another user's action or reach their conversation", async () => {
    script.push(use('quote_booking', { listing_id: listingId, vehicle_id: driver.vehicleId, ...slot(60) }), say('Shall I?'))
    const t1 = await ConciergeService.send({ userId: driver.userId, conversationId: null, message: 'quote', location: null })
    const actionId = t1.pendingActions[0]!.actionId

    const stolen = await runTool('confirm_action', { action_id: actionId }, { ...ctxFor(otherDriverId), conversationId: t1.conversationId, turn: 9 })
    expect(stolen.isError).toBe(true)
    await expect(ConciergeService.send({ userId: otherDriverId, conversationId: t1.conversationId, message: 'yes', location: null }))
      .rejects.toThrow(/not found/i)
  })

  it('answers a refusal politely and stores nothing for that turn', async () => {
    script.push(() => msg([], 'refusal'))
    const r = await ConciergeService.send({ userId: otherDriverId, conversationId: null, message: 'something off-limits', location: null })
    expect(r.reply).toMatch(/can't help with that/)
    const row = await pg.query(`SELECT turn, messages FROM concierge_conversations WHERE id = $1`, [r.conversationId])
    expect(row.rows[0]).toMatchObject({ turn: 0 })
  })

  it('sends the current time and shared location with the message', async () => {
    script.push(say('Looking near you.'))
    await ConciergeService.send({ userId: otherDriverId, conversationId: null, message: 'charge me', location: { lat: 51.5, lng: -0.12 } })
    const first = JSON.stringify(calls[0]!.messages[0])
    expect(first).toMatch(/\[Context: it is .* UK time\. The user shared their location: 51\.5000, -0\.1200\.\]/)
  })
})

describe('host revenue advisor', () => {
  it("reports each charger's performance with a nearby-market comparison", async () => {
    const r = await runTool('host_performance', { days: 90 }, ctxFor(hostUserId))
    expect(r.isError).toBe(false)
    const out = JSON.parse(r.content) as { periodDays: number; chargers: Record<string, unknown>[] }
    expect(out.periodDays).toBe(90)
    const mine = out.chargers.find((c) => c['listingId'] === listingId)
    expect(mine).toMatchObject({
      price: '£5.00/hour',
      bookings: expect.any(Number),
      hoursBookedPerWeek: expect.any(Number),
      earned: expect.stringMatching(/^£/),
      nearby: { otherChargersWithin5km: expect.any(Number) },
    })
    expect(Array.isArray(mine!['quietDays'])).toBe(true)

    const nonHost = await pg.query<{ id: string }>(`SELECT u.id FROM users u WHERE NOT EXISTS (SELECT 1 FROM host_profiles hp JOIN charger_listings cl ON cl.host_profile_id = hp.id WHERE hp.user_id = u.id) LIMIT 1`)
    const notHost = await runTool('host_performance', {}, ctxFor(nonHost.rows[0]!.id))
    expect(notHost).toMatchObject({ isError: true, content: expect.stringMatching(/no charger listings/) })
  })

  it('changes a price only after the host confirms in a later turn', async () => {
    script.push(use('propose_price_change', { listing_id: listingId, price_per_hour_pence: 450 }), say('Lower it to £4.50/hour?'))
    const t1 = await ConciergeService.send({ userId: hostUserId, conversationId: null, message: 'Should I lower my price?', location: null, isHost: true })
    expect(t1.pendingActions[0]!.summary).toBe(
      `Change ${(await pg.query<{ title: string }>(`SELECT title FROM charger_listings WHERE id = $1`, [listingId])).rows[0]!.title} from £5.00/hour to £4.50/hour. Existing bookings keep their price.`,
    )
    expect(JSON.stringify(calls[0]!.messages[0])).toContain('The user is a host with chargers on Zipgrid.')
    const before = await pg.query<{ p: number }>(`SELECT price_per_hour_cents AS p FROM charger_listings WHERE id = $1`, [listingId])
    expect(before.rows[0]!.p).toBe(500)

    script.push(use('confirm_action', { action_id: t1.pendingActions[0]!.actionId }), say('Done.'))
    const t2 = await ConciergeService.send({ userId: hostUserId, conversationId: t1.conversationId, message: 'Yes', location: null, isHost: true })
    expect(t2.completedActions).toEqual([{ kind: 'price_changed', summary: expect.stringMatching(/^New price for/) }])
    const after = await pg.query<{ p: number }>(`SELECT price_per_hour_cents AS p FROM charger_listings WHERE id = $1`, [listingId])
    expect(after.rows[0]!.p).toBe(450)
    await pg.query(`UPDATE charger_listings SET price_per_hour_cents = 500 WHERE id = $1`, [listingId])
  })

  it("refuses prices on someone else's charger or that the pricing model doesn't use", async () => {
    const notMine = await runTool('propose_price_change', { listing_id: listingId, price_per_hour_pence: 100 }, ctxFor(driver.userId))
    expect(notMine).toMatchObject({ isError: true, content: expect.stringMatching(/not one of yours/) })
    const { ListingService } = await import('@/domains/charging/ListingService')
    await expect(ListingService.updatePricing(listingId, hostUserId, { pricePerSessionPence: 300 })).rejects.toThrow(/doesn't apply/)
    await expect(ListingService.updatePricing(listingId, driver.userId, { pricePerHourPence: 300 })).rejects.toThrow(/your own listings/)
  })

  it('approves a booking request after confirmation', async () => {
    await pg.query(`UPDATE charger_listings SET instant_book_enabled = FALSE WHERE id = $1`, [listingId])
    try {
      const { BookingService } = await import('@/domains/booking/BookingService')
      const s = slot(200)
      const b = await BookingService.create({
        userId: driver.userId, listingId, vehicleId: driver.vehicleId,
        scheduledStart: new Date(s.start), scheduledEnd: new Date(s.end), paymentMethodId: null, payWithWallet: true,
      })
      expect(b.status).toBe('pending')

      const pendingList = JSON.parse((await runTool('host_bookings', { pending_only: true }, ctxFor(hostUserId))).content) as { bookings: { bookingId: string; needsYourApproval: boolean }[] }
      expect(pendingList.bookings).toContainEqual(expect.objectContaining({ bookingId: b.id, needsYourApproval: true }))

      script.push(use('propose_approve_booking', { booking_id: b.id }), say('Approve it?'))
      const t1 = await ConciergeService.send({ userId: hostUserId, conversationId: null, message: 'Any requests?', location: null, isHost: true })
      script.push(use('confirm_action', { action_id: t1.pendingActions[0]!.actionId }), say('Approved.'))
      const t2 = await ConciergeService.send({ userId: hostUserId, conversationId: t1.conversationId, message: 'Yes approve', location: null, isHost: true })
      expect(t2.completedActions[0]!.kind).toBe('approved')
      const row = await pg.query<{ status: string }>(`SELECT status FROM bookings WHERE id = $1`, [b.id])
      expect(row.rows[0]!.status).toBe('confirmed')
    } finally {
      await pg.query(`UPDATE charger_listings SET instant_book_enabled = TRUE WHERE id = $1`, [listingId])
    }
  })
})
