/**
 * @file BookingService.ts
 * @description Booking service — create, confirm, cancel bookings with overlap checking,
 * pricing snapshots, QR/PIN generation, and Stripe PaymentIntent hold.
 *
 * Money rule: ALL monetary values stored and returned as pence (integer).
 * Column names in DB say "_cents" but the currency is always GBP pence.
 *
 * @module domains/booking
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '@/lib/errors/AppError'
import { AvailabilityService } from '@/domains/charging/AvailabilityService'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ──────────────────────────────────────────────────── */

export type CreateBookingInput = {
  /** UUID of the authenticated user (NOT driver_profile_id) */
  userId: string
  listingId: string
  vehicleId: string
  scheduledStart: Date
  scheduledEnd: Date
  /** Stripe payment method id (pm_xxx) — pre-saved on customer */
  paymentMethodId: string
  /** Stripe PaymentIntent id created by caller before invoking service */
  stripePaymentIntentId: string
  /** Estimated cost in pence (calculated by caller, stored here as snapshot) */
  estimatedCostPence: number
}

export type BookingRow = {
  id: string
  listingId: string
  driverProfileId: string
  vehicleId: string
  status: string
  scheduledStart: Date
  scheduledEnd: Date
  durationMinutes: number
  pricingModel: string
  estimatedCostPence: number
  accessType: string
  accessInstructions: string | null
  instantBook: boolean
  driverArrivalCode: string | null
  sessionPin: string | null
  confirmedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  cancellationReason: string | null
  stripePaymentIntentId: string | null
  listingTitle: string | null
  listingCity: string | null
  listingLatitude: number | null
  listingLongitude: number | null
  /** OCPP charge point ID for the listing — used by the start session flow */
  ocppChargePointId: string | null
  hostName: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Generates a cryptographically random numeric code of `len` digits.
 * Uses Math.random for simplicity — not for security-critical secrets.
 * For a production PIN, swap to `crypto.getRandomValues`.
 */
function randomPin(len: 6 | 8): string {
  const chars = '0123456789'
  const arr = new Uint8Array(len)
  // Use globalThis.crypto if available (Node 18+), else fallback
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr)
    return Array.from(arr)
      .map((b) => chars[b % chars.length])
      .join('')
  }
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * 10)]).join('')
}

/**
 * Booking domain service.
 */
export const BookingService = {
  /**
   * Creates a booking with a pricing snapshot, generates QR/PIN codes,
   * and links the pre-created Stripe PaymentIntent.
   *
   * The caller (API route) is responsible for:
   * 1. Creating the Stripe PaymentIntent with capture_method: 'manual' BEFORE calling this.
   * 2. Passing the `stripePaymentIntentId` here so it's stored atomically.
   *
   * On instant-book listings the booking is immediately `confirmed`.
   * On manual-approve listings it starts as `pending`.
   *
   * @throws {ValidationError} if driver/vehicle not found or time window invalid
   * @throws {ConflictError}  if time slot is unavailable (overlap or blackout)
   */
  async create(input: CreateBookingInput): Promise<BookingRow> {
    const db = await getDb()

    // ── 1. Resolve driver_profile_id from userId ───────────────────────
    const dpResult = await db.execute(
      `SELECT id FROM driver_profiles WHERE user_id = $1 LIMIT 1`,
      [input.userId],
    )
    if (dpResult.rows.length === 0) {
      throw new ValidationError('Driver profile not found. Please complete your profile.')
    }
    const driverProfileId = (dpResult.rows[0] as { id: string }).id

    // ── 2. Validate vehicle belongs to driver ──────────────────────────
    const vehResult = await db.execute(
      `SELECT id FROM driver_vehicles WHERE id = $1 AND driver_profile_id = $2 LIMIT 1`,
      [input.vehicleId, driverProfileId],
    )
    if (vehResult.rows.length === 0) {
      throw new ValidationError('Vehicle not found on your account.')
    }

    // ── 3. Fetch listing to take pricing snapshot ──────────────────────
    const listResult = await db.execute(
      `SELECT id, host_profile_id, title, pricing_model, status,
              price_per_kwh_cents, price_per_hour_cents, price_per_session_cents,
              idle_fee_per_min_cents, peak_surcharge_pct,
              access_type, access_instructions, instant_book_enabled,
              min_booking_hours, max_booking_hours, buffer_minutes
       FROM charger_listings WHERE id = $1 LIMIT 1`,
      [input.listingId],
    )
    if (listResult.rows.length === 0) {
      throw new ValidationError('Listing not found.')
    }
    const listing = listResult.rows[0] as {
      id: string
      host_profile_id: string
      title: string
      pricing_model: string
      status: string
      price_per_kwh_cents: number | null
      price_per_hour_cents: number | null
      price_per_session_cents: number | null
      idle_fee_per_min_cents: number
      peak_surcharge_pct: string
      access_type: string
      access_instructions: string | null
      instant_book_enabled: boolean
      min_booking_hours: string
      max_booking_hours: string
      buffer_minutes: number
    }

    if (listing.status !== 'active') {
      throw new ValidationError('This listing is not currently accepting bookings.')
    }

    // ── 4. Validate booking window length ─────────────────────────────
    const durationHours =
      (input.scheduledEnd.getTime() - input.scheduledStart.getTime()) / 3_600_000
    const minHours = parseFloat(listing.min_booking_hours)
    const maxHours = parseFloat(listing.max_booking_hours)
    if (durationHours < minHours) {
      throw new ValidationError(
        `Minimum booking duration is ${minHours} hour${minHours !== 1 ? 's' : ''}.`,
      )
    }
    if (durationHours > maxHours) {
      throw new ValidationError(`Maximum booking duration is ${maxHours} hours.`)
    }
    if (input.scheduledStart <= new Date()) {
      throw new ValidationError('Start time must be in the future.')
    }

    // ── 5. Check availability (schedule + blackouts + overlap) ─────────
    const available = await AvailabilityService.isAvailable(
      input.listingId,
      input.scheduledStart,
      input.scheduledEnd,
    )
    if (!available) {
      throw new ConflictError(
        'This time slot is unavailable — the charger is already booked or blocked.',
        'BOOKING_OVERLAP',
      )
    }

    // ── 6. Determine status ────────────────────────────────────────────
    const instantBook = listing.instant_book_enabled
    const status = instantBook ? 'confirmed' : 'pending'

    // ── 7. Generate QR/PIN codes ───────────────────────────────────────
    const driverArrivalCode = randomPin(8)
    const sessionPin = randomPin(6)

    // ── 8. Resolve host_profile_id → host user id for event ───────────
    const hostResult = await db.execute(
      `SELECT u.id AS user_id, u.full_name
       FROM host_profiles hp JOIN users u ON u.id = hp.user_id
       WHERE hp.id = $1 LIMIT 1`,
      [listing.host_profile_id],
    )
    const hostUserId =
      (hostResult.rows[0] as { user_id: string } | undefined)?.user_id ?? listing.host_profile_id
    const hostName =
      (hostResult.rows[0] as { full_name: string } | undefined)?.full_name ?? null

    // ── 9. Insert booking ──────────────────────────────────────────────
    const bookingId = uuidv4()
    const confirmedAt = instantBook ? new Date() : null

    await db.execute(
      `INSERT INTO bookings (
         id, listing_id, driver_profile_id, vehicle_id,
         scheduled_start, scheduled_end,
         status,
         pricing_model,
         quoted_price_per_kwh_cents, quoted_price_per_hour_cents,
         quoted_price_per_session_cents, quoted_idle_fee_per_min_cents,
         peak_surcharge_pct, estimated_cost_cents,
         access_type, access_instructions,
         instant_book,
         driver_arrival_code, session_pin,
         confirmed_at,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6,
         $7,
         $8,
         $9, $10, $11, $12,
         $13, $14,
         $15, $16,
         $17,
         $18, $19,
         $20,
         NOW(), NOW()
       )`,
      [
        bookingId,
        input.listingId,
        driverProfileId,
        input.vehicleId,
        input.scheduledStart.toISOString(),
        input.scheduledEnd.toISOString(),
        status,
        listing.pricing_model,
        listing.price_per_kwh_cents,
        listing.price_per_hour_cents,
        listing.price_per_session_cents,
        listing.idle_fee_per_min_cents,
        parseFloat(listing.peak_surcharge_pct),
        input.estimatedCostPence,
        listing.access_type,
        // Access instructions revealed only after confirmation — safe to store now
        listing.access_instructions,
        instantBook,
        driverArrivalCode,
        sessionPin,
        confirmedAt?.toISOString() ?? null,
      ],
    )

    // ── 10. Insert transaction (hold_placed) ───────────────────────────
    const txnId = uuidv4()
    // Platform fee: 15%
    const platformFeePence = Math.round(input.estimatedCostPence * 0.15)
    const hostEarningsPence = input.estimatedCostPence - platformFeePence

    await db.execute(
      `INSERT INTO transactions (
         id, booking_id,
         stripe_payment_intent_id,
         status,
         subtotal_cents, platform_fee_cents,
         total_charged_cents, host_earnings_cents,
         commission_rate_pct, currency,
         hold_placed_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'hold_placed',
         $4, $5, $4, $6,
         15.00, 'GBP',
         NOW(), NOW(), NOW()
       )`,
      [txnId, bookingId, input.stripePaymentIntentId, input.estimatedCostPence, platformFeePence, hostEarningsPence],
    )

    // ── 11. Publish domain event ───────────────────────────────────────
    if (instantBook) {
      eventBus.publish({
        type: 'BOOKING_CONFIRMED',
        bookingId,
        driverId: input.userId,
        hostId: hostUserId,
        listingId: input.listingId,
        scheduledStart: input.scheduledStart,
      })
    }

    return this.getById(bookingId, input.userId)
  },

  /**
   * Returns a booking by id.
   * Access instructions are only returned for confirmed or active bookings.
   * @throws {NotFoundError} if booking not found
   * @throws {ForbiddenError} if userId does not own this booking
   */
  async getById(bookingId: string, userId: string): Promise<BookingRow> {
    const db = await getDb()

    const result = await db.execute(
      `SELECT
         b.id, b.listing_id, b.driver_profile_id, b.vehicle_id,
         b.status, b.scheduled_start, b.scheduled_end, b.duration_minutes,
         b.pricing_model, b.estimated_cost_cents,
         b.access_type,
         CASE WHEN b.status IN ('confirmed','active','completed') THEN b.access_instructions ELSE NULL END AS access_instructions,
         b.instant_book,
         b.driver_arrival_code, b.session_pin,
         b.confirmed_at, b.completed_at,
         b.cancelled_at, b.cancellation_note,
         b.created_at, b.updated_at,
         t.stripe_payment_intent_id,
         cl.title AS listing_title, cl.city AS listing_city,
         cl.latitude AS listing_latitude, cl.longitude AS listing_longitude,
         cl.ocpp_charge_point_id,
         u.full_name AS host_name
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u ON u.id = hp.user_id
       LEFT JOIN transactions t ON t.booking_id = b.id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId],
    )

    if (result.rows.length === 0) throw new NotFoundError('Booking', bookingId)

    const row = result.rows[0] as Record<string, unknown>

    // Verify ownership: driver user or host user
    const ownerCheck = await db.execute(
      `SELECT dp.user_id AS driver_user
       FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId],
    )
    const driverUser = (ownerCheck.rows[0] as { driver_user: string } | undefined)?.driver_user
    // Also allow host to view
    const hostCheck = await db.execute(
      `SELECT hp.user_id AS host_user
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId],
    )
    const hostUser = (hostCheck.rows[0] as { host_user: string } | undefined)?.host_user

    if (driverUser !== userId && hostUser !== userId) {
      throw new ForbiddenError()
    }

    return this._mapRow(row)
  },

  /**
   * Returns paginated booking list for a driver.
   */
  async listByDriver(
    userId: string,
    options: { status?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ bookings: BookingRow[]; total: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const params: unknown[] = [userId]
    let statusClause = ''
    if (options.status) {
      params.push(options.status)
      statusClause = `AND b.status = $${params.length}`
    }

    const countResult = await db.execute(
      `SELECT COUNT(*)::INT AS total FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 ${statusClause}`,
      params,
    )
    const total = (countResult.rows[0] as { total: number }).total

    params.push(pageSize, offset)

    const result = await db.execute(
      `SELECT
         b.id, b.listing_id, b.driver_profile_id, b.vehicle_id,
         b.status, b.scheduled_start, b.scheduled_end, b.duration_minutes,
         b.pricing_model, b.estimated_cost_cents,
         b.access_type, NULL AS access_instructions,
         b.instant_book,
         b.driver_arrival_code, b.session_pin,
         b.confirmed_at, b.completed_at,
         b.cancelled_at, b.cancellation_note,
         b.created_at, b.updated_at,
         t.stripe_payment_intent_id,
         cl.title AS listing_title, cl.city AS listing_city,
         cl.latitude AS listing_latitude, cl.longitude AS listing_longitude,
         cl.ocpp_charge_point_id,
         u.full_name AS host_name
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u ON u.id = hp.user_id
       LEFT JOIN transactions t ON t.booking_id = b.id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 ${statusClause}
       ORDER BY b.scheduled_start DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    return {
      bookings: result.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total,
    }
  },

  /**
   * Returns paginated booking list for a host's listings.
   */
  async listByHost(
    userId: string,
    options: { status?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ bookings: BookingRow[]; total: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const params: unknown[] = [userId]
    let statusClause = ''
    if (options.status) {
      params.push(options.status)
      statusClause = `AND b.status = $${params.length}`
    }

    const countResult = await db.execute(
      `SELECT COUNT(*)::INT AS total FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE hp.user_id = $1 ${statusClause}`,
      params,
    )
    const total = (countResult.rows[0] as { total: number }).total

    params.push(pageSize, offset)

    const result = await db.execute(
      `SELECT
         b.id, b.listing_id, b.driver_profile_id, b.vehicle_id,
         b.status, b.scheduled_start, b.scheduled_end, b.duration_minutes,
         b.pricing_model, b.estimated_cost_cents,
         b.access_type,
         CASE WHEN b.status IN ('confirmed','active','completed') THEN b.access_instructions ELSE NULL END AS access_instructions,
         b.instant_book,
         b.driver_arrival_code, b.session_pin,
         b.confirmed_at, b.completed_at,
         b.cancelled_at, b.cancellation_note,
         b.created_at, b.updated_at,
         t.stripe_payment_intent_id,
         cl.title AS listing_title, cl.city AS listing_city,
         cl.latitude AS listing_latitude, cl.longitude AS listing_longitude,
         cl.ocpp_charge_point_id,
         u.full_name AS host_name
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u ON u.id = hp.user_id
       LEFT JOIN transactions t ON t.booking_id = b.id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE hp.user_id = $1 ${statusClause}
       ORDER BY b.scheduled_start DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    return {
      bookings: result.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total,
    }
  },

  /**
   * Cancels a booking (driver or host).
   * Releases the Stripe PaymentIntent hold — caller handles Stripe cancel.
   * @throws {NotFoundError} if booking not found
   * @throws {ForbiddenError} if user doesn't own this booking
   * @throws {ConflictError} if booking is already completed or cancelled
   */
  async cancel(
    bookingId: string,
    userId: string,
    role: 'driver' | 'host',
    reason?: string,
  ): Promise<void> {
    const db = await getDb()

    const result = await db.execute(
      `SELECT b.id, b.status, dp.user_id AS driver_user,
              hp.user_id AS host_user, t.stripe_payment_intent_id
       FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId],
    )

    if (result.rows.length === 0) throw new NotFoundError('Booking', bookingId)

    const row = result.rows[0] as {
      id: string
      status: string
      driver_user: string
      host_user: string
      stripe_payment_intent_id: string | null
    }

    // Auth check
    if (role === 'driver' && row.driver_user !== userId) throw new ForbiddenError()
    if (role === 'host' && row.host_user !== userId) throw new ForbiddenError()

    const terminal = ['completed', 'cancelled_by_driver', 'cancelled_by_host', 'cancelled_by_platform', 'no_show']
    if (terminal.includes(row.status)) {
      throw new ConflictError(
        `Booking cannot be cancelled — it is already ${row.status}.`,
        'BOOKING_ALREADY_TERMINAL',
      )
    }

    const newStatus = role === 'driver' ? 'cancelled_by_driver' : 'cancelled_by_host'

    await db.execute(
      `UPDATE bookings
       SET status = $1, cancelled_at = NOW(), cancellation_note = $2, updated_at = NOW()
       WHERE id = $3`,
      [newStatus, reason ?? null, bookingId],
    )

    // Update transaction status to signal Stripe hold should be released
    if (row.stripe_payment_intent_id) {
      await db.execute(
        `UPDATE transactions SET status = 'fully_refunded', updated_at = NOW()
         WHERE booking_id = $1`,
        [bookingId],
      )
    }

    eventBus.publish({
      type: 'BOOKING_CANCELLED',
      bookingId,
      cancelledBy: role,
    })
  },

  /** Maps a raw DB row to BookingRow */
  _mapRow(row: Record<string, unknown>): BookingRow {
    return {
      id: row['id'] as string,
      listingId: row['listing_id'] as string,
      driverProfileId: row['driver_profile_id'] as string,
      vehicleId: row['vehicle_id'] as string,
      status: row['status'] as string,
      scheduledStart: new Date(row['scheduled_start'] as string),
      scheduledEnd: new Date(row['scheduled_end'] as string),
      durationMinutes: Number(row['duration_minutes']),
      pricingModel: row['pricing_model'] as string,
      estimatedCostPence: Number(row['estimated_cost_cents']),
      accessType: row['access_type'] as string,
      accessInstructions: (row['access_instructions'] as string | null) ?? null,
      instantBook: Boolean(row['instant_book']),
      driverArrivalCode: (row['driver_arrival_code'] as string | null) ?? null,
      sessionPin: (row['session_pin'] as string | null) ?? null,
      confirmedAt: row['confirmed_at'] ? new Date(row['confirmed_at'] as string) : null,
      completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : null,
      cancelledAt: row['cancelled_at'] ? new Date(row['cancelled_at'] as string) : null,
      cancellationReason: (row['cancellation_note'] as string | null) ?? null,
      stripePaymentIntentId:
        (row['stripe_payment_intent_id'] as string | null) ?? null,
      listingTitle: (row['listing_title'] as string | null) ?? null,
      listingCity: (row['listing_city'] as string | null) ?? null,
      listingLatitude: row['listing_latitude'] != null ? Number(row['listing_latitude']) : null,
      listingLongitude: row['listing_longitude'] != null ? Number(row['listing_longitude']) : null,
      ocppChargePointId: (row['ocpp_charge_point_id'] as string | null) ?? null,
      hostName: (row['host_name'] as string | null) ?? null,
      createdAt: new Date(row['created_at'] as string),
      updatedAt: new Date(row['updated_at'] as string),
    }
  },
}
