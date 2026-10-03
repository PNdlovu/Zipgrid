/**
 * @file BookingService.ts
 * @description Booking domain service — the single path for creating,
 * authorising, approving and cancelling bookings.
 *
 * Payment model — card (Stripe manual capture):
 *   - Bookings starting within HOLD_WINDOW_DAYS get a card hold immediately.
 *   - Bookings further out (and recurring series) store the payment method; the
 *     booking cron authorises them DEFERRED_AUTH_LEAD_HOURS before the slot
 *     (card holds expire after ~7 days, so they can't be placed earlier).
 *   - A session can only start once a hold is in place.
 *   - SettlementService captures the hold when the session completes.
 *
 * Payment model — wallet:
 *   - The estimated cost is reserved from the wallet in the same transaction
 *     that creates the booking. Recurring occurrences beyond HOLD_WINDOW_DAYS
 *     reserve when the booking cron authorises them, like card holds.
 *   - If the wallet is short and auto top-up is on, the wallet is topped up
 *     and the reservation retried, so the booking still goes through.
 *   - The transaction row has payment_source 'wallet' and no PaymentIntent;
 *     settlement and cancellation branch on it.
 *
 * Property bays: residents_only / residents_priority access and the resident
 * discount are applied here (PropertyService.bookingRulesFor); the discount is
 * baked into the quoted tariff, so the session is billed at the resident price.
 *
 * Outstanding balances: a driver with an unpaid session shortfall cannot make
 * new bookings until it is collected (ShortfallService).
 *
 * Double-booking: creation takes a per-listing advisory lock inside a
 * transaction, then re-checks availability before inserting.
 *
 * Money rule: all amounts are integer pence (DB columns say "_cents").
 * Commission: the host's plan rate is snapshotted onto the transaction when
 * payment is secured; settlement splits revenue at that rate.
 *
 * @module domains/booking
 */

import { randomInt } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { estimateBookingHold, type PricingModel } from '@zipgrid/utils'
import { getDb, transaction, type Db } from '@/lib/db'
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  ServiceUnavailableError,
} from '@/lib/errors/AppError'
import { AvailabilityService } from '@/domains/charging/AvailabilityService'
import { StripeService } from '@/domains/payments/StripeService'
import { InsufficientWalletBalanceError, WalletService } from '@/domains/payments/WalletService'
import { AutoTopupService } from '@/domains/payments/AutoTopupService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { PropertyService, PUBLIC_PRIORITY_WINDOW_HOURS } from '@/domains/property/PropertyService'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ──────────────────────────────────────────────────── */

export type CreateBookingInput = {
  /** UUID of the authenticated user (NOT driver_profile_id) */
  userId: string
  listingId: string
  vehicleId: string
  scheduledStart: Date
  scheduledEnd: Date
  /** Stripe payment method id (pm_xxx) saved on the driver's customer; null when paying by wallet */
  paymentMethodId: string | null
  /** Pay from the Zipgrid wallet instead of a card hold */
  payWithWallet?: boolean
  /** Groups the occurrences of a recurring booking */
  recurringSeriesId?: string
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
  payWithWallet: boolean
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

/** Holds are placed at booking time only within this many days of the start. */
export const HOLD_WINDOW_DAYS = 6
/** Deferred bookings are authorised this many hours before they start. */
export const DEFERRED_AUTH_LEAD_HOURS = 24

const TERMINAL_STATUSES = ['completed', 'cancelled_by_driver', 'cancelled_by_host', 'cancelled_by_platform', 'no_show']

/** Cryptographically random numeric code. */
function randomDigits(len: number): string {
  return Array.from({ length: len }, () => randomInt(0, 10)).join('')
}

/* ── Service ────────────────────────────────────────────────── */

export const BookingService = {
  /**
   * Creates a booking. Returns the booking; when a hold is due now it is placed
   * before returning (a declined card cancels the booking and throws 402).
   *
   * @throws {ValidationError}         invalid driver/vehicle/listing/window
   * @throws {ConflictError}           slot unavailable (BOOKING_OVERLAP)
   * @throws {ServiceUnavailableError} payments not configured
   * @throws {AppError}                PAYMENT_FAILED (402) when the card is declined
   * @throws {AppError}                INSUFFICIENT_WALLET_BALANCE (402) for wallet bookings
   * @throws {AppError}                OUTSTANDING_BALANCE (402) while a session shortfall is unpaid
   */
  async create(input: CreateBookingInput): Promise<BookingRow> {
    const payWithWallet = Boolean(input.payWithWallet)
    if (payWithWallet === Boolean(input.paymentMethodId)) {
      throw new ValidationError('Choose either a saved card or your wallet to pay.')
    }
    if (!payWithWallet && !StripeService.isConfigured()) throw new ServiceUnavailableError('Payments')

    const durationHours = (input.scheduledEnd.getTime() - input.scheduledStart.getTime()) / 3_600_000
    if (!(durationHours > 0)) throw new ValidationError('The booking must end after it starts.')
    if (input.scheduledStart.getTime() <= Date.now()) throw new ValidationError('Start time must be in the future.')

    const owed = await ShortfallService.outstandingPence(input.userId)
    if (owed > 0) {
      throw new AppError(
        `You have an outstanding balance of £${(owed / 100).toFixed(2)} from a previous session. Top up your wallet or update your card to clear it, then book again.`,
        'OUTSTANDING_BALANCE',
        402,
      )
    }

    const withinHoldWindow = input.scheduledStart.getTime() <= Date.now() + HOLD_WINDOW_DAYS * 86_400_000
    const reserveWalletNow = payWithWallet && (!input.recurringSeriesId || withinHoldWindow)

    const bookingId = uuidv4()
    const insert = () => transaction(async (tx) => {
      const dp = await tx.execute(`SELECT id FROM driver_profiles WHERE user_id = $1`, [input.userId])
      const driverProfileId = dp.rows[0]?.['id'] as string | undefined
      if (!driverProfileId) throw new ValidationError('Driver profile not found. Please complete your profile.')

      const veh = await tx.execute(
        `SELECT battery_capacity_kwh FROM driver_vehicles
         WHERE id = $1 AND driver_profile_id = $2 AND COALESCE(is_active, TRUE)`,
        [input.vehicleId, driverProfileId],
      )
      if (veh.rows.length === 0) throw new ValidationError('Vehicle not found on your account.')
      const batteryKwh = veh.rows[0]?.['battery_capacity_kwh'] != null ? Number(veh.rows[0]['battery_capacity_kwh']) : null

      const lst = await tx.execute(
        `SELECT cl.status, cl.pricing_model, cl.price_per_kwh_cents, cl.price_per_hour_cents,
                cl.price_per_session_cents, cl.idle_fee_per_min_cents, cl.peak_surcharge_pct,
                cl.access_type, cl.access_instructions, cl.instant_book_enabled,
                cl.min_booking_hours, cl.max_booking_hours, cl.advance_booking_days,
                cl.max_power_kw, hp.user_id AS host_user_id
         FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
         WHERE cl.id = $1`,
        [input.listingId],
      )
      const l = lst.rows[0]
      if (!l) throw new ValidationError('Listing not found.')
      if (l['status'] !== 'active') throw new ValidationError('This listing is not currently accepting bookings.')
      if (l['host_user_id'] === input.userId) throw new ValidationError('You cannot book your own charger.')

      const minHours = Number(l['min_booking_hours'] ?? 0)
      const maxHours = Number(l['max_booking_hours'] ?? 24)
      if (durationHours < minHours) throw new ValidationError(`Minimum booking duration is ${minHours} hour${minHours === 1 ? '' : 's'}.`)
      if (durationHours > maxHours) throw new ValidationError(`Maximum booking duration is ${maxHours} hours.`)
      const advanceDays = Number(l['advance_booking_days'] ?? 30)
      if (input.scheduledStart.getTime() > Date.now() + advanceDays * 86_400_000) {
        throw new ValidationError(`This charger can be booked up to ${advanceDays} days ahead.`)
      }

      const bay = await PropertyService.bookingRulesFor(tx, input.listingId, input.userId)
      if (bay && !bay.isResident) {
        if (bay.accessMode === 'residents_only') {
          throw new ValidationError(`This bay is reserved for residents of ${bay.propertyName}.`, 'RESIDENTS_ONLY')
        }
        if (bay.accessMode === 'residents_priority'
            && input.scheduledStart.getTime() > Date.now() + PUBLIC_PRIORITY_WINDOW_HOURS * 3_600_000) {
          throw new ValidationError(
            `Residents of ${bay.propertyName} get priority on this bay. You can book it up to ${PUBLIC_PRIORITY_WINDOW_HOURS} hours ahead.`,
            'RESIDENT_PRIORITY_WINDOW',
          )
        }
      }
      const discountPct = bay?.isResident ? bay.residentDiscountPct : 0
      const quote = (pence: unknown): number | null =>
        pence == null ? null : Math.round((Number(pence) * (100 - discountPct)) / 100)
      const perKwh = quote(l['price_per_kwh_cents'])
      const perHour = quote(l['price_per_hour_cents'])
      const perSession = quote(l['price_per_session_cents'])

      // Serialise bookings on this listing, then re-check availability.
      await tx.execute(`SELECT lock_listing_for_booking($1)`, [input.listingId])
      const available = await AvailabilityService.isAvailable(input.listingId, input.scheduledStart, input.scheduledEnd, tx)
      if (!available) {
        throw new ConflictError('This time slot is unavailable — the charger is already booked or closed.', 'BOOKING_OVERLAP')
      }

      const estimatedPence = estimateBookingHold({
        tariff: {
          pricingModel: l['pricing_model'] as PricingModel,
          pricePerKwhPence: perKwh,
          pricePerHourPence: perHour,
          pricePerSessionPence: perSession,
          idleFeePerMinPence: 0,
        },
        maxPowerKw: Number(l['max_power_kw']),
        batteryKwh,
        start: input.scheduledStart,
        end: input.scheduledEnd,
      })

      await tx.execute(
        `INSERT INTO bookings (
           id, listing_id, driver_profile_id, vehicle_id, scheduled_start, scheduled_end,
           status, pricing_model,
           quoted_price_per_kwh_cents, quoted_price_per_hour_cents,
           quoted_price_per_session_cents, quoted_idle_fee_per_min_cents,
           peak_surcharge_pct, estimated_cost_cents,
           access_type, access_instructions, instant_book,
           driver_arrival_code, session_pin, payment_method_id, recurring_series_id, pay_with_wallet
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          bookingId, input.listingId, driverProfileId, input.vehicleId,
          input.scheduledStart.toISOString(), input.scheduledEnd.toISOString(),
          l['pricing_model'],
          perKwh, perHour, perSession,
          l['idle_fee_per_min_cents'] ?? 0, l['peak_surcharge_pct'] ?? 0, estimatedPence,
          l['access_type'], l['access_instructions'], Boolean(l['instant_book_enabled']),
          randomDigits(8), randomDigits(6), input.paymentMethodId, input.recurringSeriesId ?? null, payWithWallet,
        ],
      )

      if (reserveWalletNow) await this._reserveWallet(tx, bookingId, input.userId, estimatedPence)
      return { instantBook: Boolean(l['instant_book_enabled']), hostUserId: l['host_user_id'] as string }
    })

    let created: { instantBook: boolean; hostUserId: string }
    try {
      created = await insert()
    } catch (err) {
      // Wallet short: top up automatically (when enabled) and try once more.
      if (!(err instanceof InsufficientWalletBalanceError)) throw err
      if (!(await AutoTopupService.ensureAvailable(input.userId, err.requiredPence))) throw err
      created = await insert()
    }
    const { instantBook, hostUserId } = created

    if (!payWithWallet && withinHoldWindow) {
      await this.placeHold(bookingId) // cancels the booking and throws on decline
    }

    if (instantBook) {
      const db = await getDb()
      await db.execute(
        `UPDATE bookings SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [bookingId],
      )
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

  /** Reserves wallet funds for a booking and records its wallet transaction (caller's transaction). */
  async _reserveWallet(tx: Db, bookingId: string, userId: string, amountPence: number): Promise<void> {
    await WalletService.reserve(tx, userId, amountPence) // throws InsufficientWalletBalanceError
    await tx.execute(
      `INSERT INTO transactions (
         booking_id, payment_source, status,
         subtotal_cents, authorized_cents, platform_fee_cents, total_charged_cents,
         host_earnings_cents, commission_rate_pct, currency, hold_placed_at
       ) VALUES ($1, 'wallet', 'hold_placed', $2, $2, 0, 0, 0,
                 (SELECT hp.commission_rate_pct FROM bookings bk JOIN charger_listings cl ON cl.id = bk.listing_id JOIN host_profiles hp ON hp.id = cl.host_profile_id WHERE bk.id = $1), 'GBP', NOW())`,
      [bookingId, amountPence],
    )
  },

  /** Cancels a booking whose payment could not be secured and throws PAYMENT_FAILED (402). */
  async _failPayment(bookingId: string, message: string): Promise<never> {
    const db = await getDb()
    await db.execute(
      `UPDATE bookings
       SET status = 'cancelled_by_platform', cancelled_at = NOW(),
           cancellation_reason = 'other', cancellation_note = 'Payment authorisation failed',
           updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'confirmed')`,
      [bookingId],
    )
    throw new AppError(message, 'PAYMENT_FAILED', 402)
  },

  /**
   * Secures payment for a deferred wallet booking: reserves the estimate,
   * auto-topping up once if needed. Cancels the booking (402) when it can't.
   */
  async _reserveDeferredWallet(bookingId: string, userId: string, amountPence: number): Promise<void> {
    const attempt = () => transaction((tx) => this._reserveWallet(tx, bookingId, userId, amountPence))
    try {
      await attempt()
    } catch (err) {
      if (!(err instanceof InsufficientWalletBalanceError)) throw err
      if (await AutoTopupService.ensureAvailable(userId, amountPence)) return attempt()
      return this._failPayment(bookingId, err.message)
    }
  },

  /**
   * Secures payment for a booking (idempotent per booking): a card hold, or a
   * wallet reservation for wallet bookings. When payment can't be secured the
   * booking is cancelled by the platform and PAYMENT_FAILED (402) is thrown.
   */
  async placeHold(bookingId: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT b.estimated_cost_cents, b.payment_method_id, b.status, b.pay_with_wallet,
              u.id AS user_id,
              EXISTS (SELECT 1 FROM transactions t WHERE t.booking_id = b.id) AS has_transaction
       FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       JOIN users u ON u.id = dp.user_id
       WHERE b.id = $1`,
      [bookingId],
    )
    const b = res.rows[0]
    if (!b) throw new NotFoundError('Booking', bookingId)
    if (b['has_transaction']) return
    if (TERMINAL_STATUSES.includes(b['status'] as string)) return
    if (b['pay_with_wallet']) {
      return this._reserveDeferredWallet(bookingId, b['user_id'] as string, Number(b['estimated_cost_cents']))
    }
    if (!b['payment_method_id']) throw new ValidationError('No payment method on this booking.')

    const customerId = await StripeCustomer.getOrCreateId(b['user_id'] as string)

    const amount = Number(b['estimated_cost_cents'])
    let hold: { paymentIntentId: string; status: string } | null = null
    let failure = 'Card authorisation failed. Please check your payment method.'
    try {
      hold = await StripeService.createPaymentIntentHold({
        amountPence: amount,
        stripeCustomerId: customerId,
        paymentMethodId: b['payment_method_id'] as string,
        bookingId,
        description: `Zipgrid charging booking ${bookingId.slice(0, 8)}`,
        idempotencyKey: `hold-${bookingId}`,
      })
    } catch (err) {
      if (err instanceof ServiceUnavailableError) throw err
      if (StripeService.isCardError(err)) {
        failure = err.message
      } else {
        throw err // Stripe/API outage — leave booking intact for retry
      }
    }

    if (!hold || hold.status !== 'requires_capture') {
      if (hold) await StripeService.cancelPaymentIntent(hold.paymentIntentId, 'abandoned').catch(() => {})
      return this._failPayment(bookingId, failure)
    }

    await db.execute(
      `INSERT INTO transactions (
         booking_id, stripe_payment_intent_id, status,
         subtotal_cents, authorized_cents, platform_fee_cents, total_charged_cents,
         host_earnings_cents, commission_rate_pct, currency, hold_placed_at
       ) VALUES ($1, $2, 'hold_placed', $3, $3, 0, 0, 0,
                 (SELECT hp.commission_rate_pct FROM bookings bk JOIN charger_listings cl ON cl.id = bk.listing_id JOIN host_profiles hp ON hp.id = cl.host_profile_id WHERE bk.id = $1), 'GBP', NOW())
       ON CONFLICT (booking_id) DO NOTHING`,
      [bookingId, hold.paymentIntentId, amount],
    )
    await db.execute(`UPDATE bookings SET stripe_payment_intent_id = $2 WHERE id = $1`, [bookingId, hold.paymentIntentId])
  },

  /**
   * Secures payment (card hold or wallet reservation) for deferred bookings
   * starting within DEFERRED_AUTH_LEAD_HOURS. Declines cancel the booking and
   * notify the driver. Called by the scheduler; `walletOnly` skips card
   * bookings (used when Stripe is not configured).
   */
  async authorizeDue(limit = 50, walletOnly = false): Promise<{ authorised: number; declined: number; errors: number }> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT b.id, dp.user_id AS driver_user_id
       FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE b.status IN ('pending', 'confirmed')
         AND (b.pay_with_wallet OR ($3::BOOLEAN = FALSE AND b.payment_method_id IS NOT NULL))
         AND b.scheduled_start > NOW()
         AND b.scheduled_start <= NOW() + make_interval(hours => $1)
         AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.booking_id = b.id)
       ORDER BY b.scheduled_start
       LIMIT $2`,
      [DEFERRED_AUTH_LEAD_HOURS, limit, walletOnly],
    )
    let authorised = 0
    let declined = 0
    let errors = 0
    for (const r of res.rows) {
      try {
        await this.placeHold(r['id'] as string)
        authorised++
      } catch (err) {
        if (err instanceof AppError && err.code === 'PAYMENT_FAILED') {
          declined++
          const { NotificationService } = await import('@/domains/notifications/NotificationService')
          await NotificationService.send({
            userId: r['driver_user_id'] as string,
            category: 'booking_cancelled',
            title: 'Booking cancelled — payment declined',
            body: `We couldn't secure payment for an upcoming booking (${err.message}), so it has been cancelled. Please update your card or top up your wallet and rebook.`,
            actionUrl: `/bookings/${r['id'] as string}`,
            channels: ['in_app', 'email'],
          }).catch(() => {})
        } else {
          errors++
          console.error('[BookingService.authorizeDue]', r['id'], err)
        }
      }
    }
    return { authorised, declined, errors }
  },

  /**
   * Host approves a pending booking.
   * @throws {ForbiddenError} not the listing's host
   * @throws {ConflictError}  booking is not pending
   */
  async approve(bookingId: string, hostUserId: string): Promise<void> {
    const driverUserId = await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT b.status, hp.user_id AS host_user_id, dp.user_id AS driver_user_id
         FROM bookings b
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE b.id = $1
         FOR UPDATE OF b`,
        [bookingId],
      )
      const b = res.rows[0]
      if (!b) throw new NotFoundError('Booking', bookingId)
      if (b['host_user_id'] !== hostUserId) throw new ForbiddenError()
      if (b['status'] !== 'pending') {
        throw new ConflictError(`Booking is already ${b['status'] as string}.`, 'INVALID_STATE')
      }
      await tx.execute(
        `UPDATE bookings SET status = 'confirmed', confirmed_at = NOW(), host_approved_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [bookingId],
      )
      return b['driver_user_id'] as string
    })

    const { NotificationService } = await import('@/domains/notifications/NotificationService')
    await NotificationService.send({
      userId: driverUserId,
      category: 'booking_confirmed',
      title: 'Booking approved',
      body: "Your booking has been approved by the host. You're all set!",
      actionUrl: `/bookings/${bookingId}`,
      channels: ['in_app', 'email'],
    }).catch((err: unknown) => console.error('[BookingService.approve] notify failed', err))
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
         b.instant_book, b.pay_with_wallet,
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
         b.instant_book, b.pay_with_wallet,
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
         b.instant_book, b.pay_with_wallet,
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
   * Cancels a booking as its driver or as the listing's host (determined from
   * ownership, not from the caller's roles). Releases the card hold (or wallet reservation) first, so
   * the database never claims a refund that did not happen.
   *
   * @throws {ForbiddenError} caller is neither the driver nor the host
   * @throws {ConflictError}  booking is terminal, or a session is in progress
   */
  async cancel(bookingId: string, userId: string, reason?: string): Promise<{ cancelledBy: 'driver' | 'host' }> {
    const cancelledBy = await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT b.status, dp.user_id AS driver_user, hp.user_id AS host_user,
                t.id AS transaction_id, t.status AS txn_status, t.stripe_payment_intent_id,
                t.payment_source, t.authorized_cents
         FROM bookings b
         JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN host_profiles hp    ON hp.id = cl.host_profile_id
         LEFT JOIN transactions t ON t.booking_id = b.id
         WHERE b.id = $1
         FOR UPDATE OF b`,
        [bookingId],
      )
      const row = res.rows[0]
      if (!row) throw new NotFoundError('Booking', bookingId)

      const role: 'driver' | 'host' | null =
        row['driver_user'] === userId ? 'driver' : row['host_user'] === userId ? 'host' : null
      if (!role) throw new ForbiddenError()

      const status = row['status'] as string
      if (TERMINAL_STATUSES.includes(status)) {
        throw new ConflictError(`Booking cannot be cancelled — it is already ${status}.`, 'BOOKING_ALREADY_TERMINAL')
      }
      if (status === 'active') {
        throw new ConflictError('A charging session is in progress — stop the session first.', 'SESSION_IN_PROGRESS')
      }

      if (row['txn_status'] === 'hold_placed' && row['payment_source'] === 'wallet') {
        await WalletService.release(tx, row['driver_user'] as string, Number(row['authorized_cents']))
      } else if (row['txn_status'] === 'hold_placed') {
        try {
          await StripeService.cancelPaymentIntent(row['stripe_payment_intent_id'] as string)
        } catch (err) {
          // Already cancelled/expired on Stripe's side counts as released.
          const code = (err as { code?: string }).code
          if (code !== 'payment_intent_unexpected_state') throw err
        }
      }
      if (row['txn_status'] === 'hold_placed') {
        await tx.execute(
          `UPDATE transactions
           SET status = 'fully_refunded', refund_reason = $2, refunded_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row['transaction_id'], `booking_cancelled_by_${role}`],
        )
      }

      await tx.execute(
        `UPDATE bookings
         SET status = $2::booking_status, cancelled_at = NOW(), cancelled_by_user_id = $3,
             cancellation_reason = $4::cancellation_reason, cancellation_note = $5, updated_at = NOW()
         WHERE id = $1`,
        [
          bookingId,
          role === 'driver' ? 'cancelled_by_driver' : 'cancelled_by_host',
          userId,
          role === 'driver' ? 'driver_changed_mind' : 'host_unavailable',
          reason ?? null,
        ],
      )
      return role
    })

    eventBus.publish({ type: 'BOOKING_CANCELLED', bookingId, cancelledBy })
    return { cancelledBy }
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
      payWithWallet: Boolean(row['pay_with_wallet']),
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
