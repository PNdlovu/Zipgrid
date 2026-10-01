/**
 * @file SessionService.ts
 * @description Charging session domain service.
 * Handles session lifecycle: start, live meter updates, stop, and cost calculation.
 *
 * Session states (mirrors OCPP):
 *   preparing  → OCPP RemoteStart sent, waiting for StartTransaction
 *   charging   → StartTransaction received, energy flowing
 *   paused     → SuspendedEV or SuspendedEVSE status
 *   finishing  → RemoteStop sent, waiting for StopTransaction
 *   completed  → StopTransaction received and finalised
 *   faulted    → Charger reported a fault
 *
 * Cost calculation:
 *   - kWh model: energy_consumed_wh / 1000 × price_per_kwh_pence
 *   - Hour model: duration_minutes / 60 × price_per_hour_pence
 *   - Session model: flat price_per_session_pence
 *   - Idle fee: applied after idle_grace_minutes (default 10) per minute
 *
 * @module domains/sessions
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
  AppError,
} from '@/lib/errors/AppError'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ─────────────────────────────────────────────────── */

export type SessionRow = {
  id: string
  bookingId: string
  chargePointId: string
  connectorId: number
  status: 'preparing' | 'charging' | 'paused' | 'finishing' | 'completed' | 'faulted'
  ocppTransactionId: number | null
  ocppIdTag: string | null
  energyConsumedWh: number
  peakPowerW: number | null
  powerW: number | null
  socPercent: number | null
  totalCostPence: number
  pricePerKwhPence: number
  pricingModel: string
  idleFeePence: number
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

export type MeterValueUpdate = {
  sessionId: string
  energyConsumedWh: number
  powerW?: number
  socPercent?: number
  voltageV?: number
  currentA?: number
  timestamp: Date
}

export type StartSessionInput = {
  bookingId: string
  chargePointId: string
  connectorId: number
  ocppIdTag: string
  /** Optional: only provided after OCPP StartTransaction confirms */
  ocppTransactionId?: number
}

/* ── Constants ──────────────────────────────────────────────── */

const IDLE_GRACE_MINUTES = 10
const PLATFORM_FEE_PCT = 0.15

/* ── Service ────────────────────────────────────────────────── */

export const SessionService = {

  /**
   * Creates a session record after the OCPP RemoteStart is dispatched.
   * Status starts as 'preparing' — moved to 'charging' on StartTransaction.
   */
  async start(input: StartSessionInput): Promise<SessionRow> {
    const db = await getDb()

    // Validate booking is confirmed
    const bookingRes = await db.execute(
      `SELECT b.id, b.status, b.pricing_model,
              b.quoted_price_per_kwh_cents, b.quoted_price_per_hour_cents,
              b.quoted_price_per_session_cents, b.quoted_idle_fee_per_min_cents
       FROM bookings b
       WHERE b.id = $1 LIMIT 1`,
      [input.bookingId],
    )
    if (bookingRes.rows.length === 0) throw new NotFoundError('Booking', input.bookingId)

    const booking = bookingRes.rows[0] as {
      id: string
      status: string
      pricing_model: string
      quoted_price_per_kwh_cents: number | null
      quoted_price_per_hour_cents: number | null
      quoted_price_per_session_cents: number | null
      quoted_idle_fee_per_min_cents: number
    }

    if (booking.status !== 'confirmed') {
      throw new ValidationError(`Booking is ${booking.status} — cannot start session.`)
    }

    // Check for existing active session on this booking
    const existing = await db.execute(
      `SELECT id FROM charging_sessions
       WHERE booking_id = $1 AND status NOT IN ('completed','faulted')
       LIMIT 1`,
      [input.bookingId],
    )
    if (existing.rows.length > 0) {
      throw new ValidationError('An active session already exists for this booking.')
    }

    const sessionId = uuidv4()

    await db.execute(
      `INSERT INTO charging_sessions (
         id, booking_id, charge_point_id, connector_id,
         status, ocpp_id_tag, ocpp_transaction_id,
         pricing_model, price_per_kwh_cents,
         idle_fee_per_min_cents,
         energy_consumed_wh, total_cost_pence, peak_power_w,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         'preparing', $5, $6,
         $7, $8, $9,
         0, 0, 0,
         NOW(), NOW()
       )`,
      [
        sessionId,
        input.bookingId,
        input.chargePointId,
        input.connectorId,
        input.ocppIdTag,
        input.ocppTransactionId ?? null,
        booking.pricing_model,
        booking.quoted_price_per_kwh_cents ?? 0,
        booking.quoted_idle_fee_per_min_cents ?? 0,
      ],
    )

    // Mark booking as active
    await db.execute(
      `UPDATE bookings SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [input.bookingId],
    )

    return this.getById(sessionId)
  },

  /**
   * Called when OCPP StartTransaction is received.
   * Transitions from 'preparing' → 'charging' and records the OCPP transaction ID.
   */
  async onStartTransaction(
    chargePointId: string,
    ocppTransactionId: number,
    idTag: string,
    meterStartWh: number,
    timestamp: Date,
  ): Promise<void> {
    const db = await getDb()

    const res = await db.execute(
      `SELECT id FROM charging_sessions
       WHERE charge_point_id = $1 AND ocpp_id_tag = $2
         AND status = 'preparing'
       ORDER BY created_at DESC LIMIT 1`,
      [chargePointId, idTag],
    )
    if (res.rows.length === 0) {
      // Unknown session — log and reject (handled by caller via OCPP response)
      return
    }

    const sessionId = (res.rows[0] as { id: string }).id

    await db.execute(
      `UPDATE charging_sessions
       SET status = 'charging',
           ocpp_transaction_id = $2,
           started_at = $3,
           energy_consumed_wh = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId, ocppTransactionId, timestamp.toISOString(), meterStartWh],
    )
  },

  /**
   * Processes a MeterValues OCPP message.
   * Updates live energy, power, and SoC readings.
   * Recalculates running cost.
   */
  async updateFromMeterValues(update: MeterValueUpdate): Promise<void> {
    const db = await getDb()

    const sessionRes = await db.execute(
      `SELECT cs.id, cs.pricing_model, cs.price_per_kwh_cents, cs.started_at,
              cs.idle_fee_per_min_cents, cs.peak_power_w,
              b.quoted_price_per_session_cents, b.quoted_price_per_hour_cents
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1 AND cs.status = 'charging'
       LIMIT 1`,
      [update.sessionId],
    )
    if (sessionRes.rows.length === 0) return

    const session = sessionRes.rows[0] as {
      id: string
      pricing_model: string
      price_per_kwh_cents: number
      started_at: string | null
      idle_fee_per_min_cents: number
      peak_power_w: number
      quoted_price_per_session_cents: number | null
      quoted_price_per_hour_cents: number | null
    }

    const runningCostPence = this._calculateRunningCost(
      session.pricing_model,
      session.price_per_kwh_cents,
      update.energyConsumedWh,
      session.started_at ? new Date(session.started_at) : null,
      session.idle_fee_per_min_cents,
      session.quoted_price_per_session_cents ?? null,
      session.quoted_price_per_hour_cents ?? null,
    )

    const newPeak = Math.max(session.peak_power_w ?? 0, update.powerW ?? 0)

    await db.execute(
      `UPDATE charging_sessions
       SET energy_consumed_wh = $2,
           power_w = $3,
           soc_percent = $4,
           peak_power_w = $5,
           total_cost_pence = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        update.sessionId,
        update.energyConsumedWh,
        update.powerW ?? null,
        update.socPercent ?? null,
        newPeak,
        runningCostPence,
      ],
    )
  },

  /**
   * Finalises a session from a StopTransaction OCPP message.
   * Calculates final cost, captures Stripe payment, awards reward points.
   */
  async onStopTransaction(
    chargePointId: string,
    ocppTransactionId: number,
    meterStopWh: number,
    timestamp: Date,
    reason: string,
  ): Promise<void> {
    const db = await getDb()

    const res = await db.execute(
      `SELECT cs.id, cs.booking_id, cs.pricing_model,
              cs.price_per_kwh_cents, cs.started_at,
              cs.idle_fee_per_min_cents,
              b.driver_profile_id, b.estimated_cost_cents,
              b.quoted_price_per_session_cents, b.quoted_price_per_hour_cents,
              t.id AS transaction_id, t.stripe_payment_intent_id
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       LEFT JOIN transactions t ON t.booking_id = b.id AND t.status = 'hold_placed'
       WHERE cs.charge_point_id = $1
         AND cs.ocpp_transaction_id = $2
         AND cs.status IN ('charging', 'paused', 'finishing')
       LIMIT 1`,
      [chargePointId, ocppTransactionId],
    )

    if (res.rows.length === 0) return

    const row = res.rows[0] as {
      id: string
      booking_id: string
      pricing_model: string
      price_per_kwh_cents: number
      started_at: string | null
      idle_fee_per_min_cents: number
      driver_profile_id: string
      estimated_cost_cents: number
      quoted_price_per_session_cents: number | null
      quoted_price_per_hour_cents: number | null
      transaction_id: string | null
      stripe_payment_intent_id: string | null
    }

    const startedAt = row.started_at ? new Date(row.started_at) : null
    const endedAt = timestamp
    const durationMinutes = startedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000)
      : 0

    const finalCostPence = this._calculateFinalCost(
      row.pricing_model,
      row.price_per_kwh_cents,
      meterStopWh,
      startedAt,
      endedAt,
      row.idle_fee_per_min_cents,
      row.quoted_price_per_session_cents ?? null,
      row.quoted_price_per_hour_cents ?? null,
    )

    const platformFeePence = Math.round(finalCostPence * PLATFORM_FEE_PCT)

    // Update session to completed
    await db.execute(
      `UPDATE charging_sessions
       SET status = 'completed',
           energy_consumed_wh = $2,
           total_cost_pence = $3,
           power_w = 0,
           ended_at = $4,
           duration_minutes = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, meterStopWh, finalCostPence, endedAt.toISOString(), durationMinutes],
    )

    // Update booking to completed
    await db.execute(
      `UPDATE bookings
       SET status = 'completed', completed_at = $2, updated_at = NOW()
       WHERE id = $1`,
      [row.booking_id, endedAt.toISOString()],
    )

    // Update transaction with final amounts
    if (row.transaction_id) {
      const hostEarningsPence = finalCostPence - platformFeePence
      await db.execute(
        `UPDATE transactions
         SET status = 'captured',
             total_charged_cents = $2,
             platform_fee_cents = $3,
             host_earnings_cents = $4,
             captured_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [row.transaction_id, finalCostPence, platformFeePence, hostEarningsPence],
      )
    }

    // Look up driver user_id for event
    const driverRes = await db.execute(
      `SELECT user_id FROM driver_profiles WHERE id = $1 LIMIT 1`,
      [row.driver_profile_id],
    )
    const driverUserId = driverRes.rows.length > 0
      ? (driverRes.rows[0] as { user_id: string }).user_id
      : row.driver_profile_id

    // Log OCPP stop reason
    await db.execute(
      `INSERT INTO ocpp_event_log (id, charge_point_id, action, payload, created_at)
       VALUES ($1, $2, 'StopTransaction', $3::jsonb, NOW())
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(),
        chargePointId,
        JSON.stringify({ ocppTransactionId, meterStopWh, reason, sessionId: row.id }),
      ],
    )

    // Publish SESSION_COMPLETED domain event
    eventBus.publish({
      type: 'SESSION_COMPLETED',
      sessionId: row.id,
      bookingId: row.booking_id,
      energyConsumedWh: meterStopWh,
      totalCostPence: finalCostPence,
    })

    void driverUserId // used by rewards subscriber on the event bus
  },

  /**
   * Returns a session by ID.
   * Access: session's driver or the listing's host.
   */
  async getById(sessionId: string, userId?: string): Promise<SessionRow> {
    const db = await getDb()

    const res = await db.execute(
      `SELECT cs.id, cs.booking_id, cs.charge_point_id, cs.connector_id,
              cs.status, cs.ocpp_transaction_id, cs.ocpp_id_tag,
              cs.energy_consumed_wh, cs.peak_power_w, cs.power_w, cs.soc_percent,
              cs.total_cost_pence, cs.price_per_kwh_cents, cs.pricing_model,
              cs.idle_fee_per_min_cents,
              cs.started_at, cs.ended_at, cs.duration_minutes,
              cs.created_at, cs.updated_at,
              cl.title AS listing_title, cl.city AS listing_city,
              u_host.full_name AS host_name,
              u_driver.full_name AS driver_name
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u_host ON u_host.id = hp.user_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       JOIN users u_driver ON u_driver.id = dp.user_id
       WHERE cs.id = $1
       LIMIT 1`,
      [sessionId],
    )

    if (res.rows.length === 0) throw new NotFoundError('Session', sessionId)

    const row = res.rows[0] as Record<string, unknown>

    // Auth check if userId provided
    if (userId) {
      const driverUser = (row['driver_name'] as string | null) // shortcut via name
      // More reliable: re-check ownership
      const authCheck = await db.execute(
        `SELECT dp.user_id AS driver_uid, hp.user_id AS host_uid
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         WHERE cs.id = $1 LIMIT 1`,
        [sessionId],
      )
      if (authCheck.rows.length > 0) {
        const auth = authCheck.rows[0] as { driver_uid: string; host_uid: string }
        if (auth.driver_uid !== userId && auth.host_uid !== userId) {
          throw new ForbiddenError()
        }
      }
      void driverUser
    }

    return this._mapRow(row)
  },

  /**
   * Returns the active session for a booking (if any).
   */
  async getActiveForBooking(bookingId: string): Promise<SessionRow | null> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id FROM charging_sessions
       WHERE booking_id = $1 AND status NOT IN ('completed', 'faulted')
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId],
    )
    if (res.rows.length === 0) return null
    return this.getById((res.rows[0] as { id: string }).id)
  },

  /**
   * Returns paginated session history for a driver.
   */
  async listByDriver(
    userId: string,
    options: { page?: number; pageSize?: number; status?: string } = {},
  ): Promise<{ sessions: SessionRow[]; total: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const params: unknown[] = [userId]
    let statusClause = ''
    if (options.status) {
      params.push(options.status)
      statusClause = `AND cs.status = $${params.length}`
    }

    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 ${statusClause}`,
      params,
    )
    const total = (countRes.rows[0] as { total: number }).total

    params.push(pageSize, offset)
    const res = await db.execute(
      `SELECT cs.id, cs.booking_id, cs.charge_point_id, cs.connector_id,
              cs.status, cs.ocpp_transaction_id, cs.ocpp_id_tag,
              cs.energy_consumed_wh, cs.peak_power_w, cs.power_w, cs.soc_percent,
              cs.total_cost_pence, cs.price_per_kwh_cents, cs.pricing_model,
              cs.idle_fee_per_min_cents,
              cs.started_at, cs.ended_at, cs.duration_minutes,
              cs.created_at, cs.updated_at,
              cl.title AS listing_title, cl.city AS listing_city,
              u_host.full_name AS host_name,
              u_driver.full_name AS driver_name
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u_host ON u_host.id = hp.user_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       JOIN users u_driver ON u_driver.id = dp.user_id
       WHERE dp.user_id = $1 ${statusClause}
       ORDER BY cs.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    return {
      sessions: res.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total,
    }
  },

  /**
   * Returns paginated session history for a host's listings.
   */
  async listByHost(
    userId: string,
    options: { page?: number; pageSize?: number; listingId?: string } = {},
  ): Promise<{ sessions: SessionRow[]; total: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const params: unknown[] = [userId]
    let listingClause = ''
    if (options.listingId) {
      params.push(options.listingId)
      listingClause = `AND b.listing_id = $${params.length}`
    }

    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE hp.user_id = $1 ${listingClause}`,
      params,
    )
    const total = (countRes.rows[0] as { total: number }).total

    params.push(pageSize, offset)
    const res = await db.execute(
      `SELECT cs.id, cs.booking_id, cs.charge_point_id, cs.connector_id,
              cs.status, cs.ocpp_transaction_id, cs.ocpp_id_tag,
              cs.energy_consumed_wh, cs.peak_power_w, cs.power_w, cs.soc_percent,
              cs.total_cost_pence, cs.price_per_kwh_cents, cs.pricing_model,
              cs.idle_fee_per_min_cents,
              cs.started_at, cs.ended_at, cs.duration_minutes,
              cs.created_at, cs.updated_at,
              cl.title AS listing_title, cl.city AS listing_city,
              u_host.full_name AS host_name,
              u_driver.full_name AS driver_name
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u_host ON u_host.id = hp.user_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       JOIN users u_driver ON u_driver.id = dp.user_id
       WHERE hp.user_id = $1 ${listingClause}
       ORDER BY cs.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    return {
      sessions: res.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total,
    }
  },

  /**
   * Marks a session as faulted (charger-reported fault).
   */
  async markFaulted(sessionId: string, errorCode: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `UPDATE charging_sessions
       SET status = 'faulted', fault_code = $2, ended_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('completed', 'faulted')`,
      [sessionId, errorCode],
    )
  },

  // ── Cost calculation helpers ──────────────────────────────

  /**
   * Calculates running cost mid-session (used for live meter updates).
   * For `hybrid` model: flat session fee + per-kWh component.
   * For `per_hour`:  pricePerKwhPence holds the hour rate (stored convention).
   */
  _calculateRunningCost(
    pricingModel: string,
    pricePerKwhPence: number,
    energyWh: number,
    startedAt: Date | null,
    idleFeePencePerMin: number,
    pricePerSessionPence: number | null = null,
    pricePerHourPence: number | null = null,
  ): number {
    switch (pricingModel) {
      case 'per_kwh':
        return Math.round((energyWh / 1000) * pricePerKwhPence)
      case 'per_hour': {
        if (!startedAt) return 0
        const elapsedMinutes = (Date.now() - startedAt.getTime()) / 60_000
        const hourRate = pricePerHourPence ?? pricePerKwhPence // fallback for legacy rows
        return Math.round((elapsedMinutes / 60) * hourRate)
      }
      case 'per_session':
        return pricePerSessionPence ?? pricePerKwhPence // flat rate
      case 'hybrid': {
        // Flat session fee + per-kWh energy component
        const flat = pricePerSessionPence ?? 0
        const kwh = Math.round((energyWh / 1000) * pricePerKwhPence)
        return flat + kwh
      }
      default:
        return Math.round((energyWh / 1000) * pricePerKwhPence)
    }
  },

  /**
   * Calculates final cost at session end, including idle fees.
   * For `hybrid` model: flat session fee + per-kWh component + idle.
   */
  _calculateFinalCost(
    pricingModel: string,
    pricePerKwhPence: number,
    finalEnergyWh: number,
    startedAt: Date | null,
    endedAt: Date,
    idleFeePencePerMin: number,
    pricePerSessionPence: number | null = null,
    pricePerHourPence: number | null = null,
  ): number {
    let baseCost = 0

    switch (pricingModel) {
      case 'per_kwh':
        baseCost = Math.round((finalEnergyWh / 1000) * pricePerKwhPence)
        break
      case 'per_hour': {
        if (!startedAt) break
        const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000
        const hourRate = pricePerHourPence ?? pricePerKwhPence // fallback for legacy rows
        baseCost = Math.round((minutes / 60) * hourRate)
        break
      }
      case 'per_session':
        baseCost = pricePerSessionPence ?? pricePerKwhPence
        break
      case 'hybrid': {
        // Flat session fee + per-kWh energy component
        const flat = pricePerSessionPence ?? 0
        const kwh = Math.round((finalEnergyWh / 1000) * pricePerKwhPence)
        baseCost = flat + kwh
        break
      }
      default:
        baseCost = Math.round((finalEnergyWh / 1000) * pricePerKwhPence)
    }

    // Add idle fee for time over grace period after session ends
    // (idle = charger occupied but not charging — handled via status transitions)
    // Simplified: if session was short vs booking window, charge idle time
    let idleFee = 0
    if (idleFeePencePerMin > 0 && startedAt) {
      const totalMinutes = (endedAt.getTime() - startedAt.getTime()) / 60_000
      const idleMinutes = Math.max(0, totalMinutes - IDLE_GRACE_MINUTES)
      // Only charge idle if energy was low (driver likely disconnected early)
      const kwhConsumed = finalEnergyWh / 1000
      if (kwhConsumed < 2 && idleMinutes > 0) {
        idleFee = Math.round(idleMinutes * idleFeePencePerMin)
      }
    }

    return baseCost + idleFee
  },

  _mapRow(r: Record<string, unknown>): SessionRow {
    return {
      id: r['id'] as string,
      bookingId: r['booking_id'] as string,
      chargePointId: r['charge_point_id'] as string,
      connectorId: Number(r['connector_id']),
      status: r['status'] as SessionRow['status'],
      ocppTransactionId: r['ocpp_transaction_id'] != null ? Number(r['ocpp_transaction_id']) : null,
      ocppIdTag: (r['ocpp_id_tag'] as string | null) ?? null,
      energyConsumedWh: Number(r['energy_consumed_wh'] ?? 0),
      peakPowerW: r['peak_power_w'] != null ? Number(r['peak_power_w']) : null,
      powerW: r['power_w'] != null ? Number(r['power_w']) : null,
      socPercent: r['soc_percent'] != null ? Number(r['soc_percent']) : null,
      totalCostPence: Number(r['total_cost_pence'] ?? 0),
      pricePerKwhPence: Number(r['price_per_kwh_cents'] ?? 0),
      pricingModel: (r['pricing_model'] as string) ?? 'per_kwh',
      idleFeePence: Number(r['idle_fee_per_min_cents'] ?? 0),
      startedAt: r['started_at'] ? new Date(r['started_at'] as string) : null,
      endedAt: r['ended_at'] ? new Date(r['ended_at'] as string) : null,
      durationMinutes: r['duration_minutes'] != null ? Number(r['duration_minutes']) : null,
      listingTitle: (r['listing_title'] as string | null) ?? null,
      listingCity: (r['listing_city'] as string | null) ?? null,
      hostName: (r['host_name'] as string | null) ?? null,
      driverName: (r['driver_name'] as string | null) ?? null,
      createdAt: new Date(r['created_at'] as string),
      updatedAt: new Date(r['updated_at'] as string),
    }
  },
}
