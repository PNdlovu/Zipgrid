/**
 * @file IncidentService.ts
 * @description Safety incident service — report, track and resolve incidents
 * (incident_reports table). Uses the schema's own vocabulary:
 *
 *   type:     property_damage | vehicle_damage | personal_injury | electrical_fault |
 *             theft | trespassing | harassment | charger_vandalism | other
 *   severity: low | medium | high | critical
 *   status:   reported → under_investigation → evidence_requested →
 *             resolved_no_claim | claim_filed → claim_approved | claim_denied → closed
 *
 * Critical incidents move straight to under_investigation.
 *
 * @module domains/trust
 */

import { getDb } from '@/lib/db'
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors/AppError'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ─────────────────────────────────────────────────── */

export type IncidentType =
  | 'property_damage' | 'vehicle_damage' | 'personal_injury' | 'electrical_fault'
  | 'theft' | 'trespassing' | 'harassment' | 'charger_vandalism' | 'other'

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'

export type IncidentStatus =
  | 'reported' | 'under_investigation' | 'evidence_requested' | 'resolved_no_claim'
  | 'claim_filed' | 'claim_approved' | 'claim_denied' | 'closed'

export type ReportIncidentInput = {
  reporterUserId: string
  listingId: string
  bookingId?: string
  sessionId?: string
  type: IncidentType
  severity: IncidentSeverity
  title: string
  description: string
  photoUrls?: string[]
  occurredAt?: Date
  location?: { lat: number; lng: number }
}

export type IncidentRow = {
  id: string
  reporterUserId: string
  listingId: string | null
  bookingId: string | null
  sessionId: string | null
  type: IncidentType
  severity: IncidentSeverity
  status: IncidentStatus
  title: string
  description: string
  photoUrls: string[]
  investigationNotes: string | null
  resolutionNotes: string | null
  occurredAt: Date | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  listingTitle: string | null
  reporterName: string | null
}

const SELECT = `
  SELECT i.id, i.reported_by_user_id, i.listing_id, i.booking_id, i.session_id,
         i.incident_type, i.severity, i.status, i.title, i.description, i.photo_urls,
         i.investigation_notes, i.resolution_notes, i.incident_occurred_at,
         i.resolved_at, i.created_at, i.updated_at,
         cl.title AS listing_title, u.full_name AS reporter_name,
         hp.user_id AS host_user_id
  FROM incident_reports i
  JOIN users u                  ON u.id = i.reported_by_user_id
  LEFT JOIN charger_listings cl ON cl.id = i.listing_id
  LEFT JOIN host_profiles hp    ON hp.id = cl.host_profile_id`

/* ── Service ────────────────────────────────────────────────── */

export const IncidentService = {
  /**
   * Reports a new incident and publishes INCIDENT_REPORTED (audit log,
   * safety score recalculation).
   */
  async report(input: ReportIncidentInput): Promise<IncidentRow> {
    const db = await getDb()
    const listing = await db.execute(`SELECT 1 FROM charger_listings WHERE id = $1`, [input.listingId])
    if (listing.rows.length === 0) throw new ValidationError('Listing not found.')

    const res = await db.execute(
      `INSERT INTO incident_reports (
         reported_by_user_id, listing_id, booking_id, session_id,
         incident_type, severity, status, title, description, photo_urls,
         incident_occurred_at, incident_lat, incident_lng
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.reporterUserId, input.listingId, input.bookingId ?? null, input.sessionId ?? null,
        input.type, input.severity,
        input.severity === 'critical' ? 'under_investigation' : 'reported',
        input.title.slice(0, 200), input.description, input.photoUrls ?? [],
        input.occurredAt?.toISOString() ?? null,
        input.location?.lat ?? null, input.location?.lng ?? null,
      ],
    )
    const id = res.rows[0]?.['id'] as string

    eventBus.publish({
      type: 'INCIDENT_REPORTED',
      incidentId: id,
      listingId: input.listingId,
      severity: input.severity === 'critical' ? 'high' : input.severity,
    })

    return this.getById(id)
  },

  /** Returns an incident; with `userId`, only the reporter or listing host may read it. */
  async getById(incidentId: string, userId?: string): Promise<IncidentRow> {
    const db = await getDb()
    const res = await db.execute(`${SELECT} WHERE i.id = $1`, [incidentId])
    const row = res.rows[0]
    if (!row) throw new NotFoundError('Incident', incidentId)
    if (userId && row['reported_by_user_id'] !== userId && row['host_user_id'] !== userId) {
      throw new ForbiddenError()
    }
    return this._mapRow(row)
  },

  /** Paginated list — a user's incidents (as reporter or host), or all for admins. */
  async list(options: {
    userId?: string
    adminView?: boolean
    status?: IncidentStatus
    severity?: IncidentSeverity
    listingId?: string
    page?: number
    pageSize?: number
  } = {}): Promise<{ incidents: IncidentRow[]; total: number }> {
    const db = await getDb()
    const page = Math.max(1, options.page ?? 1)
    const pageSize = Math.min(Math.max(1, options.pageSize ?? 20), 100)

    const conditions: string[] = []
    const params: unknown[] = []
    const add = (sql: string, value: unknown) => {
      params.push(value)
      conditions.push(sql.replaceAll('?', `$${params.length}`))
    }
    if (options.userId && !options.adminView) add('(i.reported_by_user_id = ? OR hp.user_id = ?)', options.userId)
    if (options.status) add('i.status = ?', options.status)
    if (options.severity) add('i.severity = ?', options.severity)
    if (options.listingId) add('i.listing_id = ?', options.listingId)
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRes, rowsRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total
         FROM incident_reports i
         LEFT JOIN charger_listings cl ON cl.id = i.listing_id
         LEFT JOIN host_profiles hp    ON hp.id = cl.host_profile_id
         ${where}`,
        params,
      ),
      db.execute(
        `${SELECT}
         ${where}
         ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                  i.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
    ])

    return {
      incidents: rowsRes.rows.map((r) => this._mapRow(r)),
      total: Number((countRes.rows[0] as { total: number }).total),
    }
  },

  /** Admin: moves an incident to a new status, optionally adding investigation notes. */
  async updateStatus(incidentId: string, status: IncidentStatus, notes?: string, adminUserId?: string): Promise<IncidentRow> {
    const db = await getDb()
    const terminal = status === 'resolved_no_claim' || status === 'closed'
    await db.execute(
      `UPDATE incident_reports
       SET status = $2,
           investigation_notes = CASE WHEN $3::text IS NULL THEN investigation_notes
                                      ELSE COALESCE(investigation_notes || E'\\n', '') || $3::text END,
           assigned_to_user_id = COALESCE($4, assigned_to_user_id),
           resolved_at = CASE WHEN $5 THEN COALESCE(resolved_at, NOW()) ELSE resolved_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [incidentId, status, notes ?? null, adminUserId ?? null, terminal],
    )
    return this.getById(incidentId)
  },

  /** Admin: closes an incident with resolution notes. */
  async resolve(incidentId: string, resolutionNotes: string, adminUserId?: string): Promise<IncidentRow> {
    const db = await getDb()
    await db.execute(
      `UPDATE incident_reports
       SET status = 'resolved_no_claim', resolution_notes = $2,
           assigned_to_user_id = COALESCE($3, assigned_to_user_id),
           resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [incidentId, resolutionNotes, adminUserId ?? null],
    )
    return this.getById(incidentId)
  },

  _mapRow(r: Record<string, unknown>): IncidentRow {
    const date = (v: unknown) => (v ? new Date(v as string) : null)
    return {
      id: r['id'] as string,
      reporterUserId: r['reported_by_user_id'] as string,
      listingId: (r['listing_id'] as string | null) ?? null,
      bookingId: (r['booking_id'] as string | null) ?? null,
      sessionId: (r['session_id'] as string | null) ?? null,
      type: r['incident_type'] as IncidentType,
      severity: r['severity'] as IncidentSeverity,
      status: r['status'] as IncidentStatus,
      title: r['title'] as string,
      description: r['description'] as string,
      photoUrls: (r['photo_urls'] as string[] | null) ?? [],
      investigationNotes: (r['investigation_notes'] as string | null) ?? null,
      resolutionNotes: (r['resolution_notes'] as string | null) ?? null,
      occurredAt: date(r['incident_occurred_at']),
      resolvedAt: date(r['resolved_at']),
      createdAt: new Date(r['created_at'] as string),
      updatedAt: new Date(r['updated_at'] as string),
      listingTitle: (r['listing_title'] as string | null) ?? null,
      reporterName: (r['reporter_name'] as string | null) ?? null,
    }
  },
}
