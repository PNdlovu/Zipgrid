/**
 * @file tools.ts
 * @description The concierge's tools. Each calls a domain service as the
 * signed-in user, so the agent can do nothing the user couldn't do in the app.
 *
 * Side effects (book, cancel, stop charging) are two-step: a propose_* / quote
 * tool records a concierge_actions row and returns its summary; confirm_action
 * runs it only in a later turn, after the user has replied (ConciergeService
 * enforces this). Read-only tools run immediately.
 *
 * @module domains/concierge
 */

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { geocodeUkPlace } from '@/lib/geo/places'
import { ListingService } from '@/domains/charging/ListingService'
import { BookingService } from '@/domains/booking/BookingService'
import { SessionService } from '@/domains/sessions/SessionService'
import { WalletService } from '@/domains/payments/WalletService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { ReviewService } from '@/domains/trust/ReviewService'

/** What a tool call runs with. */
export type ToolContext = {
  userId: string
  conversationId: string
  turn: number
  /** Device location shared with this message, if any. */
  location: { lat: number; lng: number } | null
}

export type ActionKind = 'book' | 'cancel_booking' | 'stop_session'

const pounds = (p: number | null | undefined) => (p == null ? null : `£${(p / 100).toFixed(2)}`)
const iso = (d: Date | null) => (d ? d.toISOString() : null)

function priceText(l: { pricingModel: string; pricePerKwhPence: number | null; pricePerHourPence: number | null; pricePerSessionPence: number | null }): string {
  const parts = [
    l.pricePerKwhPence != null ? `${pounds(l.pricePerKwhPence)}/kWh` : null,
    l.pricePerHourPence != null ? `${pounds(l.pricePerHourPence)}/hour` : null,
    l.pricePerSessionPence != null ? `${pounds(l.pricePerSessionPence)}/session` : null,
  ].filter(Boolean)
  return parts.join(' + ') || 'price on request'
}

async function proposeAction(ctx: ToolContext, kind: ActionKind, payload: object, summary: string): Promise<string> {
  const db = await getDb()
  const res = await db.execute(
    `INSERT INTO concierge_actions (conversation_id, user_id, kind, payload, summary, proposed_turn)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id`,
    [ctx.conversationId, ctx.userId, kind, JSON.stringify(payload), summary, ctx.turn],
  )
  return res.rows[0]!['id'] as string
}

/* ── Tool definitions ───────────────────────────────────────── */

const Coords = { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }

const schemas = {
  find_chargers: z.object({
    place: z.string().max(120).optional(),
    ...{ lat: Coords.lat.optional(), lng: Coords.lng.optional() },
    radius_km: z.number().min(1).max(50).optional(),
    min_power_kw: z.number().min(1).max(400).optional(),
    plug_type: z.string().max(30).optional(),
    instant_book_only: z.boolean().optional(),
  }),
  get_charger_details: z.object({ listing_id: z.string().uuid() }),
  my_vehicles: z.object({}),
  wallet_balance: z.object({}),
  quote_booking: z.object({
    listing_id: z.string().uuid(),
    vehicle_id: z.string().uuid(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  }),
  my_bookings: z.object({ include_past: z.boolean().optional() }),
  propose_cancel_booking: z.object({ booking_id: z.string().uuid() }),
  charging_status: z.object({}),
  propose_stop_charging: z.object({ session_id: z.string().uuid() }),
  confirm_action: z.object({ action_id: z.string().uuid() }),
} as const

export type ToolName = keyof typeof schemas

const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Beta.BetaTool['input_schema'] =>
  ({ type: 'object', properties, required, additionalProperties: false })

/** Tool definitions sent to Claude (fixed order, so the prompt cache holds). */
export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'find_chargers',
    description: 'Search bookable chargers near a UK place name or postcode, or near coordinates. With neither, searches near the location the user shared. Returns up to 8 nearest matches with price, power, rating and distance.',
    input_schema: obj({
      place: { type: 'string', description: 'UK town, city or postcode, e.g. "Manchester" or "M1 1AE"' },
      lat: { type: 'number' }, lng: { type: 'number' },
      radius_km: { type: 'number', description: 'Search radius, default 10' },
      min_power_kw: { type: 'number' },
      plug_type: { type: 'string', description: 'e.g. type2, ccs, chademo' },
      instant_book_only: { type: 'boolean' },
    }),
  },
  {
    name: 'get_charger_details',
    description: 'Full details and a trust report for one charger before booking: access, facilities, host reliability (superhost, host cancellations), recent review comments and safety incidents. Read this before recommending a charger.',
    input_schema: obj({ listing_id: { type: 'string' } }, ['listing_id']),
  },
  { name: 'my_vehicles', description: "The user's vehicles (id, name, battery size). Needed for quotes.", input_schema: obj({}) },
  { name: 'wallet_balance', description: "The user's Zipgrid wallet balance and auto top-up setting.", input_schema: obj({}) },
  {
    name: 'quote_booking',
    description: 'Price a booking and prepare it for the user to confirm. Does NOT book. Returns the estimated cost, how it will be paid, and an action_id. Show the user the summary and ask them to confirm.',
    input_schema: obj({
      listing_id: { type: 'string' }, vehicle_id: { type: 'string' },
      start: { type: 'string', description: 'ISO 8601 with offset, e.g. 2026-10-04T09:00:00+01:00' },
      end: { type: 'string', description: 'ISO 8601 with offset' },
    }, ['listing_id', 'vehicle_id', 'start', 'end']),
  },
  {
    name: 'my_bookings',
    description: "The user's bookings: upcoming by default, with access instructions and arrival codes for confirmed ones.",
    input_schema: obj({ include_past: { type: 'boolean' } }),
  },
  {
    name: 'propose_cancel_booking',
    description: 'Prepare cancelling one of the user\'s bookings (the payment hold is released in full). Does NOT cancel. Returns an action_id to confirm.',
    input_schema: obj({ booking_id: { type: 'string' } }, ['booking_id']),
  },
  { name: 'charging_status', description: "The user's charging sessions in progress: energy so far, cost so far, battery %.", input_schema: obj({}) },
  {
    name: 'propose_stop_charging',
    description: 'Prepare stopping a charging session in progress. Does NOT stop it. Returns an action_id to confirm.',
    input_schema: obj({ session_id: { type: 'string' } }, ['session_id']),
  },
  {
    name: 'confirm_action',
    description: 'Carry out a prepared booking, cancellation or stop. Only call this after the user has clearly said yes to that exact action in their latest message.',
    input_schema: obj({ action_id: { type: 'string' } }, ['action_id']),
  },
]

/* ── Implementations ────────────────────────────────────────── */

const handlers: { [K in ToolName]: (input: z.infer<(typeof schemas)[K]>, ctx: ToolContext) => Promise<unknown> } = {
  async find_chargers(input, ctx) {
    let origin: { lat: number; lng: number; label: string } | null = null
    if (input.place) {
      origin = await geocodeUkPlace(input.place)
      if (!origin) throw new ValidationError(`I couldn't find "${input.place}". Try a UK town or postcode.`)
    } else if (input.lat !== undefined && input.lng !== undefined) {
      origin = { lat: input.lat, lng: input.lng, label: 'the given coordinates' }
    } else if (ctx.location) {
      origin = { ...ctx.location, label: "the user's current location" }
    } else {
      throw new ValidationError('No location: ask the user where they want to charge, or to share their location.')
    }
    const { listings, total } = await ListingService.searchNearby({
      lat: origin.lat, lng: origin.lng,
      radiusMetres: (input.radius_km ?? 10) * 1000,
      minPowerKw: input.min_power_kw,
      plugTypes: input.plug_type ? [input.plug_type.toLowerCase()] : undefined,
      instantBookOnly: input.instant_book_only,
      pageSize: 8,
    })
    return {
      searchedNear: origin.label,
      totalFound: total,
      chargers: listings.map((l) => ({
        listingId: l.id, title: l.title, area: `${l.city} ${l.postcode}`,
        distanceKm: l.distanceMetres != null ? Math.round(l.distanceMetres / 100) / 10 : null,
        powerKw: l.maxPowerKw, plugs: l.plugTypes, price: priceText(l),
        rating: l.averageRating, reviews: l.reviewCount, instantBook: l.instantBookEnabled,
        minHours: l.minBookingHours, maxHours: l.maxBookingHours,
      })),
    }
  },

  async get_charger_details({ listing_id }) {
    const l = await ListingService.getById(listing_id)
    if (l.status !== 'active') throw new ValidationError('That charger is not currently bookable.')
    const db = await getDb()
    const [reviews, host, incidents] = await Promise.all([
      ReviewService.getForListing(listing_id, 1, 8),
      db.execute(
        `SELECT hp.is_superhost, split_part(COALESCE(u.display_name, ''), ' ', 1) AS first_name,
                (SELECT COUNT(*)::int FROM bookings b JOIN charger_listings c ON c.id = b.listing_id
                  WHERE c.host_profile_id = hp.id AND b.created_at > NOW() - INTERVAL '12 months') AS bookings_12m,
                (SELECT COUNT(*)::int FROM bookings b JOIN charger_listings c ON c.id = b.listing_id
                  WHERE c.host_profile_id = hp.id AND b.status = 'cancelled_by_host'
                    AND b.created_at > NOW() - INTERVAL '12 months') AS host_cancellations_12m
         FROM host_profiles hp JOIN users u ON u.id = hp.user_id WHERE hp.id = $1`,
        [l.hostProfileId],
      ),
      db.execute(
        `SELECT severity, COUNT(*)::int AS n FROM incident_reports
         WHERE listing_id = $1 AND created_at > NOW() - INTERVAL '12 months' GROUP BY severity`,
        [listing_id],
      ),
    ])
    const h = host.rows[0] ?? {}
    return {
      listingId: l.id, title: l.title, description: l.description,
      address: `${l.addressLine1}, ${l.city} ${l.postcode}`,
      charger: { powerKw: l.maxPowerKw, plugs: l.plugTypes, ports: l.numPorts, brand: l.chargerBrand, level: l.chargerLevel },
      price: priceText(l), idleFeePerMin: pounds(l.idleFeePerMinPence),
      booking: { instantBook: l.instantBookEnabled, minHours: l.minBookingHours, maxHours: l.maxBookingHours },
      access: l.accessType,
      facilities: {
        wifi: l.wifiAvailable, toilet: l.restroomAvailable, shelter: l.shelterAvailable, lighting: l.lightingAvailable,
        wheelchairAccessible: l.wheelchairAccessible, evOnlyParking: l.evParkingOnly,
      },
      trust: {
        averageRating: reviews.averageRating, reviewCount: reviews.total,
        superhost: Boolean(h['is_superhost']), hostFirstName: h['first_name'] ?? null,
        hostBookings12m: Number(h['bookings_12m'] ?? 0), hostCancellations12m: Number(h['host_cancellations_12m'] ?? 0),
        incidents12m: Object.fromEntries(incidents.rows.map((r) => [r['severity'], r['n']])),
        totalKwhDelivered: l.totalKwhDelivered,
        recentReviews: reviews.reviews.map((r) => ({
          rating: r.overallRating, comment: r.comment, date: r.createdAt.toISOString().slice(0, 10),
          reliability: r.ratingReliability, location: r.ratingLocation,
        })),
      },
    }
  },

  async my_vehicles(_input, ctx) {
    const db = await getDb()
    const res = await db.execute(
      `SELECT v.id, v.make, v.model, v.year, v.battery_capacity_kwh
       FROM driver_vehicles v JOIN driver_profiles dp ON dp.id = v.driver_profile_id
       WHERE dp.user_id = $1 AND COALESCE(v.is_active, TRUE) ORDER BY v.created_at`,
      [ctx.userId],
    )
    return {
      vehicles: res.rows.map((v) => ({
        vehicleId: v['id'], name: [v['year'], v['make'], v['model']].filter(Boolean).join(' '),
        batteryKwh: v['battery_capacity_kwh'] != null ? Number(v['battery_capacity_kwh']) : null,
      })),
    }
  },

  async wallet_balance(_input, ctx) {
    const w = await WalletService.getBalance(ctx.userId)
    return {
      available: pounds(w.availablePence), reservedForBookings: pounds(w.pendingPence),
      autoTopup: w.autoTopupEnabled ? `on: adds ${pounds(w.autoTopupAmountPence)} below ${pounds(w.autoTopupThresholdPence)}` : 'off',
    }
  },

  async quote_booking(input, ctx) {
    const start = new Date(input.start)
    const end = new Date(input.end)
    const q = await BookingService.quote({ userId: ctx.userId, listingId: input.listing_id, vehicleId: input.vehicle_id, scheduledStart: start, scheduledEnd: end })

    // Wallet when it covers the hold (or auto top-up will), else the default card.
    const w = await WalletService.getBalance(ctx.userId)
    let payment: { payWithWallet: true } | { payWithWallet: false; paymentMethodId: string }
    let paymentText: string
    if (w.availablePence >= q.estimatedPence || w.autoTopupEnabled) {
      payment = { payWithWallet: true }
      paymentText = w.availablePence >= q.estimatedPence ? 'from your wallet' : 'from your wallet (auto top-up will add funds)'
    } else {
      const card = await StripeCustomer.defaultCard(ctx.userId)
      if (!card) {
        throw new ValidationError(`The estimate is ${pounds(q.estimatedPence)} but the wallet only has ${pounds(w.availablePence)} and there is no saved card. The user needs to top up or add a card in Wallet first.`)
      }
      payment = { payWithWallet: false, paymentMethodId: card.paymentMethodId }
      paymentText = 'on your saved card (a hold, charged after the session)'
    }

    const listing = await ListingService.getById(input.listing_id)
    const when = `${start.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`
    const summary = `Book ${listing.title} on ${when} for about ${pounds(q.estimatedPence)}, paid ${paymentText}.`
      + (q.instantBook ? ' Confirmed instantly.' : ' The host must approve it.')
      + (q.residentDiscountPct ? ` Includes your ${q.residentDiscountPct}% resident discount.` : '')
    const actionId = await proposeAction(ctx, 'book', {
      listingId: input.listing_id, vehicleId: input.vehicle_id, start: input.start, end: input.end, ...payment,
    }, summary)
    return { actionId, summary, estimatedCost: pounds(q.estimatedPence), note: 'Not booked yet. Ask the user to confirm.' }
  },

  async my_bookings(input, ctx) {
    const { bookings } = await BookingService.listByDriver(ctx.userId, { pageSize: 20 })
    const now = Date.now()
    const list = bookings.filter((b) => input.include_past || b.scheduledEnd.getTime() > now)
    return {
      bookings: list.map((b) => ({
        bookingId: b.id, charger: b.listingTitle, city: b.listingCity, status: b.status,
        start: iso(b.scheduledStart), end: iso(b.scheduledEnd), estimatedCost: pounds(b.estimatedCostPence),
        paidBy: b.payWithWallet ? 'wallet' : 'card',
        ...(b.status === 'confirmed' ? { access: b.accessType, accessInstructions: b.accessInstructions, arrivalCode: b.driverArrivalCode } : {}),
      })),
    }
  },

  async propose_cancel_booking({ booking_id }, ctx) {
    const b = await BookingService.getById(booking_id, ctx.userId)
    if (!['pending', 'confirmed'].includes(b.status)) throw new ValidationError(`That booking is ${b.status} and can't be cancelled.`)
    const summary = `Cancel your booking at ${b.listingTitle ?? 'the charger'} on ${b.scheduledStart.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. The ${b.payWithWallet ? 'wallet reservation' : 'card hold'} is released in full.`
    const actionId = await proposeAction(ctx, 'cancel_booking', { bookingId: booking_id }, summary)
    return { actionId, summary, note: 'Not cancelled yet. Ask the user to confirm.' }
  },

  async charging_status(_input, ctx) {
    const { sessions } = await SessionService.list(ctx.userId, { role: 'driver', pageSize: 5, statuses: ['preparing', 'charging', 'paused', 'finishing'] })
    return {
      sessions: sessions.map((s) => ({
        sessionId: s.id, charger: s.listingTitle, status: s.status,
        energyKwh: Math.round(s.energyConsumedWh / 100) / 10, costSoFar: pounds(s.totalCostPence),
        batteryPercent: s.socPercent, startedAt: iso(s.startedAt),
      })),
    }
  },

  async propose_stop_charging({ session_id }, ctx) {
    const s = await SessionService.getById(session_id, ctx.userId)
    const summary = `Stop charging at ${s.listingTitle ?? 'the charger'} (${Math.round(s.energyConsumedWh / 100) / 10} kWh so far, ${pounds(s.totalCostPence)}).`
    const actionId = await proposeAction(ctx, 'stop_session', { sessionId: session_id }, summary)
    return { actionId, summary, note: 'Not stopped yet. Ask the user to confirm.' }
  },

  async confirm_action({ action_id }, ctx) {
    return executeAction(action_id, ctx)
  },
}

/**
 * Runs a prepared action. Refuses actions proposed in the current turn: the
 * user must have replied since seeing the summary.
 */
async function executeAction(actionId: string, ctx: ToolContext): Promise<unknown> {
  const db = await getDb()
  const claim = await db.execute(
    `UPDATE concierge_actions SET status = 'executed', executed_at = NOW()
     WHERE id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'pending'
       AND proposed_turn < $4 AND expires_at > NOW()
     RETURNING kind, payload, summary`,
    [actionId, ctx.conversationId, ctx.userId, ctx.turn],
  )
  const a = claim.rows[0]
  if (!a) {
    const r = await db.execute(
      `SELECT status, proposed_turn, expires_at < NOW() AS expired FROM concierge_actions
       WHERE id = $1 AND conversation_id = $2 AND user_id = $3`,
      [actionId, ctx.conversationId, ctx.userId],
    )
    const s = r.rows[0]
    if (!s) throw new NotFoundError('Action', actionId)
    if (s['status'] !== 'pending') throw new ValidationError(`That action was already ${s['status']}.`)
    if (Number(s['proposed_turn']) >= ctx.turn) throw new ValidationError('The user has not confirmed yet. Show them the summary and wait for their reply.')
    throw new ValidationError('That quote expired (15 minutes). Prepare it again.')
  }

  const payload = (typeof a['payload'] === 'string' ? JSON.parse(a['payload']) : a['payload']) as Record<string, unknown>
  try {
    let result: unknown
    if (a['kind'] === 'book') {
      const b = await BookingService.create({
        userId: ctx.userId,
        listingId: String(payload['listingId']),
        vehicleId: String(payload['vehicleId']),
        scheduledStart: new Date(String(payload['start'])),
        scheduledEnd: new Date(String(payload['end'])),
        paymentMethodId: payload['payWithWallet'] ? null : String(payload['paymentMethodId']),
        payWithWallet: Boolean(payload['payWithWallet']),
      })
      result = {
        booked: true, bookingId: b.id, status: b.status, charger: b.listingTitle,
        start: iso(b.scheduledStart), end: iso(b.scheduledEnd), estimatedCost: pounds(b.estimatedCostPence),
        ...(b.status === 'confirmed' ? { access: b.accessType, accessInstructions: b.accessInstructions, arrivalCode: b.driverArrivalCode } : { awaitingHostApproval: true }),
      }
    } else if (a['kind'] === 'cancel_booking') {
      await BookingService.cancel(String(payload['bookingId']), ctx.userId, 'Cancelled via concierge')
      result = { cancelled: true }
    } else {
      const r = await SessionService.requestStop(String(payload['sessionId']), ctx.userId)
      result = { stopping: true, status: r.status }
    }
    await db.execute(`UPDATE concierge_actions SET result = $2::jsonb WHERE id = $1`, [actionId, JSON.stringify(result)])
    return result
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'It did not go through.'
    await db.execute(
      `UPDATE concierge_actions SET status = 'failed', result = $2::jsonb WHERE id = $1`,
      [actionId, JSON.stringify({ error: message })],
    )
    throw err
  }
}

/**
 * Runs one tool call. Returns the JSON result, or an error message for Claude
 * (bad input, a rule the user hit, a missing record).
 */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
  if (!(name in schemas)) return { content: `Unknown tool: ${name}`, isError: true }
  const tool = name as ToolName
  const parsed = schemas[tool].safeParse(rawInput ?? {})
  if (!parsed.success) {
    return { content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, isError: true }
  }
  try {
    const handler = handlers[tool] as (input: unknown, ctx: ToolContext) => Promise<unknown>
    return { content: JSON.stringify(await handler(parsed.data, ctx)), isError: false }
  } catch (err) {
    if (err instanceof AppError) return { content: err.message, isError: true }
    console.error(`[concierge] tool ${name} failed`, err)
    return { content: 'Something went wrong on our side running that. Apologise and suggest trying again shortly.', isError: true }
  }
}
