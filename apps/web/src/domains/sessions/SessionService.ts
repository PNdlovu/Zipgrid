/**
 * @file SessionService.ts
 * @description Charging session domain service (web side).
 *
 * Responsibilities split with the OCPP service:
 *   web  — authorises and starts sessions (RemoteStart), requests stops,
 *          serves session data, settles payment once a session completes.
 *   OCPP — records charger facts: StartTransaction, MeterValues,
 *          StopTransaction (meter readings, timestamps, final cost).
 *
 * Session states: preparing → charging ⇄ paused → finishing → completed
 *                 (faulted / timed_out on failure)
 *
 * The tariff is snapshotted from the booking onto the session row at start so
 * pricing never changes mid-session. Pricing lives in @zipgrid/utils/pricing.
 *
 * @module domains/sessions
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, transaction } from '@/lib/db'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  AppError,
} from '@/lib/errors/AppError'
import { OcppService } from '@/domains/charging/OcppService'
import { SettlementService } from '@/domains/payments/SettlementService'
import { calculateSessionCost, type PricingModel } from '@zipgrid/utils'

/* ── Types ─────────────────────────────────────────────────── */

export type SessionStatus =
  | 'preparing' | 'charging' | 'paused' | 'finishing'
  | 'completed' | 'faulted' | 'timed_out'

export type SessionRow = {
  id: string
  bookingId: string
  chargePointId: string
  connectorId: number
  status: SessionStatus
  ocppTransactionId: number | null
  energyConsumedWh: number
  peakPowerW: number | null
  powerW: number | null
  socPercent: number | null
  totalCostPence: number
  pricePerKwhPence: number
  pricingModel: string
  idleFeePerMinPence: number
  startedAt: Date | null
  endedAt: Date | null
  durationMinutes: number | null
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
  driverName: string | null
  createdAt: Date
  updatedAt: Date
}

/** Statuses in which a session still occupies the charger. */
export const LIVE_SESSION_STATUSES: SessionStatus[] = ['preparing', 'charging', 'paused', 'finishing']

/** Driver may start from 15 minutes before the slot until the slot ends. */
const EARLY_START_MINUTES = 15

const SESSION_SELECT = `
  SELECT cs.id, cs.booking_id, cs.charge_point_id, cs.connector_id,
         cs.status, cs.ocpp_transaction_id,
         cs.energy_consumed_wh, cs.peak_power_w, cs.power_w, cs.soc_percent,
         cs.total_session_cost_cents, cs.price_per_kwh_cents, cs.pricing_model,
         cs.idle_fee_per_min_cents,
         cs.started_at, cs.ended_at, cs.duration_minutes,
         cs.created_at, cs.updated_at,
         cl.title AS listing_title, cl.city AS listing_city,
         u_host.full_name AS host_name,
         u_driver.full_name AS driver_name,
         dp.user_id AS driver_user_id, hp.user_id AS host_user_id
  FROM charging_sessions cs
  JOIN bookings b          ON b.id = cs.booking_id
  JOIN charger_listings cl ON cl.id = b.listing_id
  JOIN host_profiles hp    ON hp.id = cl.host_profile_id
  JOIN users u_host        ON u_host.id = hp.user_id
  JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
  JOIN users u_driver      ON u_driver.id = dp.user_id`

/* ── Service ────────────────────────────────────────────────── */

export const SessionService = {
  /**
   * Starts a session for a confirmed booking on the listing's own charger.
   * The session row is written before RemoteStart is sent so the charger's
   * StartTransaction can always be matched to it.
   *
   * @throws {NotFoundError}   booking not found for this driver
   * @throws {ValidationError} wrong booking state, outside the time window, no charger
   * @throws {ConflictError}   a live session already exists on this booking
   */
  async startRemote(input: { userId: string; bookingId: string; connectorId?: number }): Promise<{
    sessionId: string
    idTag: string
    status: SessionStatus
  }> {
    const connectorId = input.connectorId ?? 1
    const sessionId = uuidv4()
    // OCPP 1.6 idTag: max 20 chars
    const idTag = `ZG${sessionId.replace(/-/g, '').slice(0, 18).toUpperCase()}`

    const chargePointId = await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT b.id, b.status, b.scheduled_start, b.scheduled_end,
                b.pricing_model, b.quoted_price_per_kwh_cents, b.quoted_price_per_hour_cents,
                b.quoted_price_per_session_cents, b.quoted_idle_fee_per_min_cents,
                cl.ocpp_charge_point_id,
                (SELECT t.status FROM transactions t WHERE t.booking_id = b.id) AS txn_status
         FROM bookings b
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
         WHERE b.id = $1 AND dp.user_id = $2
         FOR UPDATE OF b`,
        [input.bookingId, input.userId],
      )
      const booking = res.rows[0] as {
        status: string
        scheduled_start: Date
        scheduled_end: Date
        pricing_model: string
        quoted_price_per_kwh_cents: number | null
        quoted_price_per_hour_cents: number | null
        quoted_price_per_session_cents: number | null
        quoted_idle_fee_per_min_cents: number | null
        ocpp_charge_point_id: string | null
        txn_status: string | null
      } | undefined
      if (!booking) throw new NotFoundError('Booking', input.bookingId)
      if (booking.txn_status !== 'hold_placed') {
        throw new ValidationError('Payment for this booking has not been authorised yet.', 'PAYMENT_NOT_AUTHORISED')
      }

      if (booking.status !== 'confirmed') {
        throw new ValidationError(`Booking is ${booking.status} — cannot start a session.`, 'INVALID_STATE')
      }
      if (!booking.ocpp_charge_point_id) {
        throw new ValidationError('This charger is not connected to Zipgrid — use the PIN start flow.', 'MISSING_CHARGER')
      }

      const now = Date.now()
      const opens = new Date(booking.scheduled_start).getTime() - EARLY_START_MINUTES * 60_000
      if (now < opens) {
        throw new ValidationError('Your booking window has not opened yet.', 'TOO_EARLY')
      }
      if (now > new Date(booking.scheduled_end).getTime()) {
        throw new ValidationError('Your booking window has passed.', 'BOOKING_EXPIRED')
      }

      const live = await tx.execute(
        `SELECT 1 FROM charging_sessions WHERE booking_id = $1 AND status = ANY($2::session_status[])`,
        [input.bookingId, LIVE_SESSION_STATUSES],
      )
      if (live.rows.length > 0) {
        throw new ConflictError('A session is already running for this booking.', 'SESSION_EXISTS')
      }

      await tx.execute(
        `INSERT INTO charging_sessions (
           id, booking_id, ocpp_charge_point_id, charge_point_id,
           ocpp_connector_id, connector_id, ocpp_id_tag, status,
           pricing_model, price_per_kwh_cents, price_per_hour_cents,
           price_per_session_cents, idle_fee_per_min_cents
         ) VALUES ($1, $2, $3, $3, $4, $4, $5, 'preparing', $6, $7, $8, $9, $10)`,
        [
          sessionId, input.bookingId, booking.ocpp_charge_point_id, connectorId, idTag,
          booking.pricing_model,
          booking.quoted_price_per_kwh_cents,
          booking.quoted_price_per_hour_cents,
          booking.quoted_price_per_session_cents,
          booking.quoted_idle_fee_per_min_cents ?? 0,
        ],
      )
      await tx.execute(
        `UPDATE bookings SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [input.bookingId],
      )
      return booking.ocpp_charge_point_id
    })

    let accepted = false
    try {
      accepted = (await OcppService.remoteStart(chargePointId, connectorId, idTag)).status === 'Accepted'
    } catch (err) {
      await this._abortStart(sessionId, input.bookingId)
      if (err instanceof AppError) throw err
      throw new AppError('Could not reach the charger — please try again.', 'OCPP_UNAVAILABLE', 503)
    }
    if (!accepted) {
      await this._abortStart(sessionId, input.bookingId)
      throw new AppError(
        'The charger rejected the start command — it may be offline or in use.',
        'OCPP_REJECTED',
        409,
      )
    }

    return { sessionId, idTag, status: 'preparing' }
  },

  /**
   * Starts a session on a non-smart charger after the driver enters the
   * booking PIN on site. No meter exists, so only time- or session-priced
   * listings can be started this way.
   */
  async startManual(input: { userId: string; bookingId: string; pin: string }): Promise<{
    sessionId: string
    alreadyStarted: boolean
  }> {
    return transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT b.id, b.status, b.session_pin, b.scheduled_start, b.scheduled_end,
                b.pricing_model, b.quoted_price_per_kwh_cents, b.quoted_price_per_hour_cents,
                b.quoted_price_per_session_cents, b.quoted_idle_fee_per_min_cents,
                cl.is_smart_charger, dp.user_id AS driver_user_id,
                (SELECT t.status FROM transactions t WHERE t.booking_id = b.id) AS txn_status
         FROM bookings b
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
         WHERE b.id = $1
         FOR UPDATE OF b`,
        [input.bookingId],
      )
      const b = res.rows[0] as {
        status: string
        session_pin: string | null
        scheduled_start: Date
        scheduled_end: Date
        pricing_model: string
        quoted_price_per_kwh_cents: number | null
        quoted_price_per_hour_cents: number | null
        quoted_price_per_session_cents: number | null
        quoted_idle_fee_per_min_cents: number | null
        is_smart_charger: boolean
        driver_user_id: string
        txn_status: string | null
      } | undefined
      if (!b) throw new NotFoundError('Booking', input.bookingId)
      if (b.driver_user_id !== input.userId) throw new ForbiddenError('You are not the driver on this booking')

      const existing = await tx.execute(
        `SELECT id FROM charging_sessions
         WHERE booking_id = $1 AND status = ANY($2::session_status[]) LIMIT 1`,
        [input.bookingId, LIVE_SESSION_STATUSES],
      )
      if (existing.rows[0]) return { sessionId: existing.rows[0]['id'] as string, alreadyStarted: true }

      if (b.status !== 'confirmed') {
        throw new ValidationError(`Booking is ${b.status} — only confirmed bookings can be started.`, 'BOOKING_NOT_CONFIRMED')
      }
      if (b.txn_status !== 'hold_placed') {
        throw new ValidationError('Payment for this booking has not been authorised yet.', 'PAYMENT_NOT_AUTHORISED')
      }
      if (b.is_smart_charger) {
        throw new ValidationError('This charger is connected — start the session from the app.', 'SMART_CHARGER_USE_OCPP')
      }
      if (b.pricing_model === 'per_kwh' || b.pricing_model === 'hybrid') {
        throw new ValidationError('Metered pricing needs a connected charger — contact the host.', 'METERED_PRICING_UNSUPPORTED')
      }

      const now = Date.now()
      const start = new Date(b.scheduled_start).getTime()
      if (now < start - EARLY_START_MINUTES * 60_000) {
        throw new ValidationError('Your booking window has not opened yet.', 'TOO_EARLY')
      }
      if (now > new Date(b.scheduled_end).getTime()) {
        throw new ValidationError('Your booking window has passed.', 'BOOKING_EXPIRED')
      }
      if (now > start + 30 * 60_000) {
        throw new ValidationError(
          'The 30-minute arrival window has closed. Please contact support.',
          'ARRIVAL_WINDOW_CLOSED',
        )
      }
      if (!b.session_pin || input.pin !== b.session_pin) {
        throw new ValidationError('Incorrect PIN. Please check your booking confirmation.', 'INVALID_PIN')
      }

      const sessionId = uuidv4()
      const chargePointId = `manual-${input.bookingId.slice(0, 8)}`
      await tx.execute(
        `INSERT INTO charging_sessions (
           id, booking_id, ocpp_charge_point_id, charge_point_id, ocpp_connector_id, connector_id,
           status, authorized_at, started_at,
           pricing_model, price_per_kwh_cents, price_per_hour_cents,
           price_per_session_cents, idle_fee_per_min_cents
         ) VALUES ($1, $2, $3, $3, 1, 1, 'charging', NOW(), NOW(), $4, $5, $6, $7, $8)`,
        [
          sessionId, input.bookingId, chargePointId, b.pricing_model,
          b.quoted_price_per_kwh_cents, b.quoted_price_per_hour_cents,
          b.quoted_price_per_session_cents, b.quoted_idle_fee_per_min_cents ?? 0,
        ],
      )
      await tx.execute(`UPDATE bookings SET status = 'active', updated_at = NOW() WHERE id = $1`, [input.bookingId])
      return { sessionId, alreadyStarted: false }
    })
  },

  /** Ends a manual (non-OCPP) session, prices it and settles payment. */
  async _completeManual(sessionId: string): Promise<void> {
    await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT started_at, pricing_model, price_per_kwh_cents, price_per_hour_cents,
                price_per_session_cents, idle_fee_per_min_cents
         FROM charging_sessions WHERE id = $1 AND status IN ('charging', 'paused')
         FOR UPDATE`,
        [sessionId],
      )
      const s = res.rows[0]
      if (!s) return
      const endedAt = new Date()
      const startedAt = s['started_at'] ? new Date(s['started_at'] as string) : null
      const cost = calculateSessionCost({
        tariff: {
          pricingModel: s['pricing_model'] as PricingModel,
          pricePerKwhPence: s['price_per_kwh_cents'] as number | null,
          pricePerHourPence: s['price_per_hour_cents'] as number | null,
          pricePerSessionPence: s['price_per_session_cents'] as number | null,
          idleFeePerMinPence: Number(s['idle_fee_per_min_cents'] ?? 0),
        },
        energyWh: 0,
        startedAt,
        endedAt,
      })
      await tx.execute(
        `UPDATE charging_sessions
         SET status = 'completed', ended_at = $2,
             duration_minutes = $3, energy_cost_cents = $4,
             total_session_cost_cents = $5, updated_at = NOW()
         WHERE id = $1`,
        [
          sessionId, endedAt.toISOString(),
          startedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000) : 0,
          cost.energyPence + cost.timePence + cost.sessionFeePence,
          cost.totalPence,
        ],
      )
    })
    await SettlementService.settleSession(sessionId)
  },

  /** Rolls a failed start back so the booking can be retried. */
  async _abortStart(sessionId: string, bookingId: string): Promise<void> {
    await transaction(async (tx) => {
      await tx.execute(
        `UPDATE charging_sessions SET status = 'timed_out', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'preparing'`,
        [sessionId],
      )
      await tx.execute(
        `UPDATE bookings SET status = 'confirmed', updated_at = NOW()
         WHERE id = $1 AND status = 'active'`,
        [bookingId],
      )
    })
  },

  /**
   * Requests a stop for a live session. Allowed for the session's driver or
   * the listing's host. Final cost is computed when the charger reports
   * StopTransaction (OCPP service), after which payment is settled.
   */
  async requestStop(sessionId: string, userId: string): Promise<{ status: SessionStatus }> {
    const session = await this.getById(sessionId, userId)

    if (session.status === 'preparing') {
      // No energy flowed and no OCPP transaction exists — just cancel.
      await this._abortStart(session.id, session.bookingId)
      return { status: 'timed_out' }
    }
    if (!['charging', 'paused'].includes(session.status)) {
      throw new ValidationError(`Session is ${session.status} — nothing to stop.`, 'INVALID_STATE')
    }
    if (session.chargePointId.startsWith('manual-')) {
      await this._completeManual(session.id)
      return { status: 'completed' }
    }
    if (session.ocppTransactionId == null) {
      throw new ValidationError('Charger has not confirmed the session yet.', 'NOT_STARTED')
    }

    const result = await OcppService.remoteStop(session.chargePointId, session.ocppTransactionId)
    if (result.status !== 'Accepted') {
      throw new AppError('The charger rejected the stop command.', 'OCPP_REJECTED', 409)
    }

    const db = await getDb()
    await db.execute(
      `UPDATE charging_sessions SET status = 'finishing', updated_at = NOW()
       WHERE id = $1 AND status IN ('charging', 'paused')`,
      [session.id],
    )
    return { status: 'finishing' }
  },

  /**
   * Returns a session. When `userId` is given, only the session's driver or
   * the listing's host may read it.
   */
  async getById(sessionId: string, userId?: string): Promise<SessionRow> {
    const db = await getDb()
    const res = await db.execute(`${SESSION_SELECT} WHERE cs.id = $1`, [sessionId])
    const row = res.rows[0]
    if (!row) throw new NotFoundError('Session', sessionId)
    if (userId && row['driver_user_id'] !== userId && row['host_user_id'] !== userId) {
      throw new ForbiddenError()
    }
    return this._mapRow(row)
  },

  /** Returns the live session for a booking, if any. */
  async getActiveForBooking(bookingId: string): Promise<SessionRow | null> {
    const db = await getDb()
    const res = await db.execute(
      `${SESSION_SELECT}
       WHERE cs.booking_id = $1 AND cs.status = ANY($2::session_status[])
       ORDER BY cs.created_at DESC LIMIT 1`,
      [bookingId, LIVE_SESSION_STATUSES],
    )
    return res.rows[0] ? this._mapRow(res.rows[0]) : null
  },

  /** Paginated session history for a driver or a host. */
  async list(
    userId: string,
    options: { role?: 'driver' | 'host'; page?: number; pageSize?: number; statuses?: string[] } = {},
  ): Promise<{ sessions: SessionRow[]; total: number }> {
    const db = await getDb()
    const page = Math.max(1, options.page ?? 1)
    const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100)
    const owner = options.role === 'host' ? 'hp.user_id' : 'dp.user_id'

    const params: unknown[] = [userId]
    let statusClause = ''
    if (options.statuses?.length) {
      params.push(options.statuses)
      statusClause = `AND cs.status::text = ANY($2::text[])`
    }

    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total
       FROM charging_sessions cs
       JOIN bookings b          ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp    ON hp.id = cl.host_profile_id
       JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
       WHERE ${owner} = $1 ${statusClause}`,
      params,
    )
    const rows = await db.execute(
      `${SESSION_SELECT}
       WHERE ${owner} = $1 ${statusClause}
       ORDER BY cs.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    )

    return {
      sessions: rows.rows.map((r) => this._mapRow(r)),
      total: Number((countRes.rows[0] as { total: number }).total),
    }
  },

  _mapRow(r: Record<string, unknown>): SessionRow {
    const num = (v: unknown) => (v == null ? null : Number(v))
    return {
      id: r['id'] as string,
      bookingId: r['booking_id'] as string,
      chargePointId: r['charge_point_id'] as string,
      connectorId: Number(r['connector_id'] ?? 1),
      status: r['status'] as SessionStatus,
      ocppTransactionId: num(r['ocpp_transaction_id']),
      energyConsumedWh: Number(r['energy_consumed_wh'] ?? 0),
      peakPowerW: num(r['peak_power_w']),
      powerW: num(r['power_w']),
      socPercent: num(r['soc_percent']),
      totalCostPence: Number(r['total_session_cost_cents'] ?? 0),
      pricePerKwhPence: Number(r['price_per_kwh_cents'] ?? 0),
      pricingModel: (r['pricing_model'] as string | null) ?? 'per_kwh',
      idleFeePerMinPence: Number(r['idle_fee_per_min_cents'] ?? 0),
      startedAt: r['started_at'] ? new Date(r['started_at'] as string) : null,
      endedAt: r['ended_at'] ? new Date(r['ended_at'] as string) : null,
      durationMinutes: num(r['duration_minutes']),
      listingTitle: (r['listing_title'] as string | null) ?? null,
      listingCity: (r['listing_city'] as string | null) ?? null,
      hostName: (r['host_name'] as string | null) ?? null,
      driverName: (r['driver_name'] as string | null) ?? null,
      createdAt: new Date(r['created_at'] as string),
      updatedAt: new Date(r['updated_at'] as string),
    }
  },
}
