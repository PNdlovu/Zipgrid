/**
 * @file DisputeService.ts
 * @description Resolution Centre cases (disputes table), raised by either the
 * driver or the host of a booking, and damage recovery from drivers.
 *
 * Rules (see /legal/host-terms and /legal/driver-terms):
 *   - Either party to a booking can open a case; it is raised against the other.
 *   - Property damage must be reported within DAMAGE_REPORT_WINDOW_DAYS of the
 *     booking ending (Airbnb's AirCover uses the same 14-day window).
 *   - Every case gets an acknowledgement deadline: 1 hour for safety problems,
 *     24 hours otherwise. The admin queue surfaces overdue cases first.
 *   - The booking and charging-session record is captured when the case opens,
 *     so the evidence cannot drift if the booking changes later.
 *   - Zipgrid does not insure hosts. When an admin upholds a host's damage claim,
 *     the driver is charged (up to MAX_DAMAGE_CHARGE_PENCE) through the same
 *     wallet → saved-card collection as a session shortfall, and the host is
 *     credited in full as it is collected. Larger losses go to the host's insurer.
 *
 * @module domains/trust
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, type Db } from '@/lib/db'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { AuditLogger } from '@/domains/compliance/AuditLogger'

export const DAMAGE_REPORT_WINDOW_DAYS = 14
export const MAX_DAMAGE_CHARGE_PENCE = 100_000 // £1,000
export const ACKNOWLEDGE_HOURS = { safety: 1, standard: 24 } as const

export const DISPUTE_TYPES = [
  'safety_incident',
  'session_fault',
  'charger_unavailable',
  'billing',
  'property_damage',
  'driver_behaviour',
  'other',
] as const
export type DisputeType = (typeof DISPUTE_TYPES)[number]

const DISPUTABLE_BOOKING_STATUSES = ['completed', 'active', 'cancelled_by_driver', 'cancelled_by_host', 'cancelled_by_platform']

export type OpenDisputeInput = {
  userId: string
  disputeType: DisputeType
  description: string
  /** Full booking id, or the short reference shown to users (first 8 characters). */
  bookingRef: string
}

export type DisputeView = {
  id: string
  status: string
  disputeType: string
  description: string
  raisedByUserId: string
  raisedAgainstUserId: string | null
  raisedBy: 'driver' | 'host' | null
  bookingId: string | null
  listingTitle: string | null
  resolutionNotes: string | null
  refundAmountPence: number | null
  damageChargePence: number
  acknowledgeBy: string | null
  acknowledgedAt: string | null
  raisedAt: string
  updatedAt: string
}

const VIEW_SELECT = `
  SELECT d.id, d.status, d.dispute_type, d.description,
         d.raised_by_user_id, d.against_user_id, d.booking_id,
         d.resolution_notes, d.resolution_amount_cents, d.damage_charge_pence,
         d.acknowledge_by, d.acknowledged_at, d.created_at, d.updated_at,
         cl.title AS listing_title,
         CASE WHEN hp.user_id = d.raised_by_user_id THEN 'host'
              WHEN dp.user_id = d.raised_by_user_id THEN 'driver' END AS raised_by_role
  FROM disputes d
  LEFT JOIN bookings b          ON b.id = d.booking_id
  LEFT JOIN charger_listings cl ON cl.id = b.listing_id
  LEFT JOIN host_profiles hp    ON hp.id = cl.host_profile_id
  LEFT JOIN driver_profiles dp  ON dp.id = b.driver_profile_id`

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)

/** Maps a disputes row (VIEW_SELECT) to the API shape. */
export function toDisputeView(r: Record<string, unknown>): DisputeView {
  return {
    id: r['id'] as string,
    status: r['status'] as string,
    disputeType: r['dispute_type'] as string,
    description: r['description'] as string,
    raisedByUserId: r['raised_by_user_id'] as string,
    raisedAgainstUserId: (r['against_user_id'] as string | null) ?? null,
    raisedBy: (r['raised_by_role'] as 'driver' | 'host' | null) ?? null,
    bookingId: (r['booking_id'] as string | null) ?? null,
    listingTitle: (r['listing_title'] as string | null) ?? null,
    resolutionNotes: (r['resolution_notes'] as string | null) ?? null,
    refundAmountPence: r['resolution_amount_cents'] != null ? Number(r['resolution_amount_cents']) : null,
    damageChargePence: Number(r['damage_charge_pence'] ?? 0),
    acknowledgeBy: iso(r['acknowledge_by']),
    acknowledgedAt: iso(r['acknowledged_at']),
    raisedAt: iso(r['created_at'])!,
    updatedAt: iso(r['updated_at'])!,
  }
}

const fmt = (pence: number) => `£${(pence / 100).toFixed(2)}`
const caseRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`

export const DisputeService = {
  /** Opens a case on a booking the user drove or hosted, raised against the other party. */
  async open(input: OpenDisputeInput): Promise<DisputeView> {
    const db = await getDb()
    const ref = input.bookingRef.trim().toLowerCase()
    const isFullId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ref)
    if (!isFullId && !/^[0-9a-f]{8}$/.test(ref)) {
      throw new ValidationError('Enter the booking reference shown on your booking (8 characters, e.g. 3F7A1B2C).')
    }

    const bookingRes = await db.execute(
      `SELECT b.id, b.status, b.scheduled_end, hp.user_id AS host_user_id, dp.user_id AS driver_user_id,
              (SELECT MAX(cs.ended_at) FROM charging_sessions cs WHERE cs.booking_id = b.id) AS session_ended_at
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp    ON hp.id = cl.host_profile_id
       JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
       WHERE ${isFullId ? 'b.id = $1::uuid' : 'b.id::text LIKE $1 || \'%\''}
         AND (dp.user_id = $2 OR hp.user_id = $2)
       LIMIT 2`,
      [ref, input.userId],
    )
    if (bookingRes.rows.length === 0) throw new NotFoundError('Booking', input.bookingRef)
    if (bookingRes.rows.length > 1) {
      throw new ValidationError('More than one of your bookings matches that reference. Open the case from the booking itself.')
    }
    const booking = bookingRes.rows[0]!
    const bookingId = booking['id'] as string
    const hostUserId = booking['host_user_id'] as string
    const driverUserId = booking['driver_user_id'] as string
    const raisedByHost = hostUserId === input.userId
    const againstUserId = raisedByHost ? driverUserId : hostUserId

    if (!DISPUTABLE_BOOKING_STATUSES.includes(booking['status'] as string)) {
      throw new ConflictError(
        `Cases can only be opened on active, completed or cancelled bookings (this booking is ${String(booking['status']).replace(/_/g, ' ')}).`,
        'INVALID_STATE',
      )
    }

    if (input.disputeType === 'property_damage') {
      const ended = new Date((booking['session_ended_at'] ?? booking['scheduled_end']) as string)
      const deadline = ended.getTime() + DAMAGE_REPORT_WINDOW_DAYS * 86_400_000
      if (Date.now() > deadline) {
        throw new ValidationError(
          `Damage must be reported within ${DAMAGE_REPORT_WINDOW_DAYS} days of the booking ending. Contact support if you could not report it in time.`,
          'REPORTING_WINDOW_CLOSED',
        )
      }
    }

    const duplicate = await db.execute(
      `SELECT id FROM disputes WHERE booking_id = $1 AND raised_by_user_id = $2 AND status <> 'closed'
         AND status::text NOT LIKE 'resolved%' LIMIT 1`,
      [bookingId, input.userId],
    )
    if (duplicate.rows.length > 0) {
      throw new ConflictError('You already have an open case for this booking. Please add to the existing case.', 'DUPLICATE_DISPUTE')
    }

    const snapshot = await this.captureSnapshot(db, bookingId)
    const ackHours = input.disputeType === 'safety_incident' ? ACKNOWLEDGE_HOURS.safety : ACKNOWLEDGE_HOURS.standard
    const id = uuidv4()
    const title = input.disputeType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

    await db.execute(
      `INSERT INTO disputes
         (id, raised_by_user_id, against_user_id, booking_id, transaction_id,
          dispute_type, title, description, status, session_snapshot, acknowledge_by)
       VALUES ($1, $2, $3, $4, (SELECT id FROM transactions WHERE booking_id = $4 LIMIT 1),
               $5, $6, $7, 'open', $8::jsonb, NOW() + make_interval(hours => $9))`,
      [id, input.userId, againstUserId, bookingId, input.disputeType, title, input.description,
       JSON.stringify(snapshot), ackHours],
    )

    await AuditLogger.logAsync({
      eventType: 'dispute.opened',
      actorId: input.userId,
      targetId: id,
      targetType: 'dispute',
      metadata: { disputeType: input.disputeType, bookingId, raisedBy: raisedByHost ? 'host' : 'driver' },
    })

    const { NotificationService } = await import('@/domains/notifications/NotificationService')
    await NotificationService.send({
      userId: againstUserId,
      category: 'system_message',
      title: `A ${raisedByHost ? 'host' : 'driver'} has opened a case about your booking`,
      body: `Case ${caseRef(id)} (${title.toLowerCase()}). Add your side and any photos in the Resolution Centre; we review both before deciding.`,
      actionUrl: '/help/resolution',
      channels: ['in_app', 'email'],
    }).catch((err: unknown) => console.error('[DisputeService.open] notify', err))

    return this.get(id)
  },

  async get(disputeId: string): Promise<DisputeView> {
    const db = await getDb()
    const res = await db.execute(`${VIEW_SELECT} WHERE d.id = $1`, [disputeId])
    if (!res.rows[0]) throw new NotFoundError('Dispute', disputeId)
    return toDisputeView(res.rows[0])
  },

  /** Cases raised by or against the user, newest first. */
  async listForUser(userId: string, options: { status?: string; page: number; pageSize: number }) {
    const db = await getDb()
    const params: unknown[] = [userId]
    let statusClause = ''
    if (options.status) {
      params.push(options.status)
      statusClause = `AND d.status::text = $2`
    }
    const [countRes, listRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total FROM disputes d
         WHERE (d.raised_by_user_id = $1 OR d.against_user_id = $1) ${statusClause}`,
        params,
      ),
      db.execute(
        `${VIEW_SELECT}
         WHERE (d.raised_by_user_id = $1 OR d.against_user_id = $1) ${statusClause}
         ORDER BY d.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, options.pageSize, (options.page - 1) * options.pageSize],
      ),
    ])
    return { disputes: listRes.rows.map(toDisputeView), total: Number(countRes.rows[0]?.['total'] ?? 0) }
  },

  /** The booking, vehicle and charging-session record at the time a case is opened. */
  async captureSnapshot(db: Db, bookingId: string): Promise<Record<string, unknown>> {
    const res = await db.execute(
      `SELECT b.id AS booking_id, b.status AS booking_status, b.scheduled_start, b.scheduled_end,
              cl.id AS listing_id, cl.title AS listing_title, cl.ocpp_charge_point_id AS charge_point_id,
              v.make AS vehicle_make, v.model AS vehicle_model, v.license_plate AS vehicle_plate,
              cs.id AS session_id, cs.status AS session_status, cs.started_at, cs.ended_at,
              cs.energy_consumed_wh, cs.peak_power_kw, cs.stop_reason, cs.fault_code, cs.fault_info,
              cs.ocpp_connector_id, cs.total_session_cost_cents
       FROM bookings b
       JOIN charger_listings cl     ON cl.id = b.listing_id
       LEFT JOIN driver_vehicles v  ON v.id = b.vehicle_id
       LEFT JOIN LATERAL (
         SELECT * FROM charging_sessions s WHERE s.booking_id = b.id ORDER BY s.created_at DESC LIMIT 1
       ) cs ON TRUE
       WHERE b.id = $1`,
      [bookingId],
    )
    return { capturedAt: new Date().toISOString(), ...(res.rows[0] ?? {}) }
  },

  /**
   * Admin: charges the driver for damage on a host-raised property damage case,
   * inside the caller's transaction. Returns the payment_shortfalls id to collect
   * once the transaction commits (ShortfallService.collect).
   */
  async openDamageCharge(tx: Db, disputeId: string, amountPence: number): Promise<string> {
    if (!Number.isInteger(amountPence) || amountPence <= 0) throw new ValidationError('Enter the damage amount in pence.')
    if (amountPence > MAX_DAMAGE_CHARGE_PENCE) {
      throw new ValidationError(
        `Damage recovery through Zipgrid is limited to ${fmt(MAX_DAMAGE_CHARGE_PENCE)}. Larger losses should be claimed through the host's insurer.`,
        'DAMAGE_OVER_LIMIT',
      )
    }
    const res = await tx.execute(
      `SELECT d.dispute_type, d.raised_by_user_id, d.damage_charge_pence,
              hp.user_id AS host_user_id, dp.user_id AS driver_user_id,
              t.id AS transaction_id, t.captured_at,
              (SELECT COUNT(*) FROM dispute_evidence e WHERE e.dispute_id = d.id)::INT
                + COALESCE(cardinality(d.evidence_urls), 0) AS evidence_count
       FROM disputes d
       JOIN bookings b          ON b.id = d.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp    ON hp.id = cl.host_profile_id
       JOIN driver_profiles dp  ON dp.id = b.driver_profile_id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE d.id = $1`,
      [disputeId],
    )
    const d = res.rows[0]
    if (!d) throw new NotFoundError('Dispute', disputeId)
    if (d['dispute_type'] !== 'property_damage' || d['raised_by_user_id'] !== d['host_user_id']) {
      throw new ValidationError('Damage can only be charged on a property damage case raised by the host.')
    }
    if (Number(d['damage_charge_pence']) > 0) throw new ConflictError('The driver has already been charged for this case.', 'DAMAGE_ALREADY_CHARGED')
    if (Number(d['evidence_count']) === 0) {
      throw new ValidationError('The host must upload evidence (photos, a repair quote or invoice) before the driver is charged.')
    }
    if (!d['transaction_id'] || !d['captured_at']) {
      throw new ValidationError('This booking has no captured payment to attach a damage charge to. Handle it manually.')
    }

    const ins = await tx.execute(
      `INSERT INTO payment_shortfalls (transaction_id, user_id, amount_pence, kind, dispute_id)
       VALUES ($1, $2, $3, 'damage', $4) RETURNING id`,
      [d['transaction_id'], d['driver_user_id'], amountPence, disputeId],
    )
    await tx.execute(`UPDATE disputes SET damage_charge_pence = $2, updated_at = NOW() WHERE id = $1`, [disputeId, amountPence])
    return ins.rows[0]!['id'] as string
  },

  /** Tells both parties that the driver has been charged for damage. Never throws. */
  async notifyDamageCharge(disputeId: string): Promise<void> {
    try {
      const view = await this.get(disputeId)
      const { NotificationService } = await import('@/domains/notifications/NotificationService')
      const amount = fmt(view.damageChargePence)
      await NotificationService.send({
        userId: view.raisedAgainstUserId!,
        category: 'payment_issue',
        title: `Damage charge of ${amount}`,
        body: `Case ${caseRef(view.id)}: after reviewing the evidence from both sides, we found the damage was caused during your booking. ${amount} is being collected from your wallet or saved card. You can appeal within 14 days by emailing support@zipgrid.co.uk with the case number.`,
        actionUrl: '/help/resolution',
        channels: ['in_app', 'email'],
      })
      await NotificationService.send({
        userId: view.raisedByUserId,
        category: 'system_message',
        title: `Damage claim upheld: ${amount}`,
        body: `Case ${caseRef(view.id)}: we are recovering ${amount} from the driver. It is added to your earnings as it is collected and paid out with your next payout.`,
        actionUrl: '/help/resolution',
        channels: ['in_app', 'email'],
      })
    } catch (err) {
      console.error('[DisputeService.notifyDamageCharge]', disputeId, err)
    }
  },
}
