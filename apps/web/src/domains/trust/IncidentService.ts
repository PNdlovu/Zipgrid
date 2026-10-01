/**
 * @file IncidentService.ts
 * @description Safety incident service — report, track, and resolve incidents.
 *
 * An incident can be:
 *   charger_damage       — driver or host reports physical damage
 *   unsafe_behaviour     — inappropriate conduct by driver/host
 *   billing_dispute      — charge amount dispute (separate from formal disputes)
 *   emergency            — driver safety emergency at a listing
 *   charger_fault        — hardware fault not resolved by OCPP (escalated from safety score)
 *   other                — catch-all
 *
 * Severity: low | medium | high | critical
 * Status flow: open → investigating → resolved | escalated
 *
 * @module domains/trust
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors/AppError'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ─────────────────────────────────────────────────── */

export type IncidentCategory =
  | 'charger_damage'
  | 'unsafe_behaviour'
  | 'billing_dispute'
  | 'emergency'
  | 'charger_fault'
  | 'other'

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IncidentStatus   = 'open' | 'investigating' | 'resolved' | 'escalated'

export type ReportIncidentInput = {
  reporterUserId: string
  listingId: string
  bookingId?: string
  sessionId?: string
  category: IncidentCategory
  severity: IncidentSeverity
  description: string
  evidenceUrls?: string[]
}

export type IncidentRow = {
  id: string
  reporterUserId: string
  listingId: string
  bookingId: string | null
  sessionId: string | null
  category: IncidentCategory
  severity: IncidentSeverity
  status: IncidentStatus
  description: string
  evidenceUrls: string[]
  adminNotes: string | null
  resolvedAt: Date | null
  resolutionNote: string | null
  createdAt: Date
  updatedAt: Date
  listingTitle: string | null
  reporterName: string | null
}

/* ── Service ────────────────────────────────────────────────── */

export const IncidentService = {

  /**
   * Reports a new incident.
   * Publishes INCIDENT_REPORTED domain event which triggers:
   *   - Admin notification
   *   - Safety score recalculation (via SafetyScoreService subscriber)
   *   - Audit log entry
   */
  async report(input: ReportIncidentInput): Promise<IncidentRow> {
    const db = await getDb()

    // Validate listing exists
    const listingRes = await db.execute(
      `SELECT id FROM charger_listings WHERE id = $1 LIMIT 1`,
      [input.listingId],
    )
    if (listingRes.rows.length === 0) {
      throw new ValidationError('Listing not found.')
    }

    const id = uuidv4()

    await db.execute(
      `INSERT INTO incidents (
         id, reporter_user_id, listing_id, booking_id, session_id,
         category, severity, status,
         description, evidence_urls,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, 'open',
         $8, $9,
         NOW(), NOW()
       )`,
      [
        id,
        input.reporterUserId,
        input.listingId,
        input.bookingId ?? null,
        input.sessionId ?? null,
        input.category,
        input.severity,
        input.description,
        JSON.stringify(input.evidenceUrls ?? []),
      ],
    )

    // Publish domain event
    eventBus.publish({
      type: 'INCIDENT_REPORTED',
      incidentId: id,
      listingId: input.listingId,
      severity: input.severity === 'critical' ? 'high'
        : input.severity === 'high' ? 'high'
        : input.severity === 'medium' ? 'medium'
        : 'low',
    })

    // Auto-escalate critical incidents
    if (input.severity === 'critical') {
      await this.escalate(id, 'Auto-escalated: critical severity')
    }

    return this.getById(id)
  },

  /**
   * Returns a single incident by ID.
   * Access: the reporter, the listing host, or an admin.
   */
  async getById(incidentId: string, userId?: string): Promise<IncidentRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT
         i.id, i.reporter_user_id, i.listing_id, i.booking_id, i.session_id,
         i.category, i.severity, i.status,
         i.description, i.evidence_urls, i.admin_notes,
         i.resolved_at, i.resolution_note,
         i.created_at, i.updated_at,
         cl.title AS listing_title,
         u.full_name AS reporter_name
       FROM incidents i
       JOIN charger_listings cl ON cl.id = i.listing_id
       JOIN users u ON u.id = i.reporter_user_id
       WHERE i.id = $1 LIMIT 1`,
      [incidentId],
    )
    if (res.rows.length === 0) throw new NotFoundError('Incident', incidentId)

    const row = res.rows[0] as Record<string, unknown>

    if (userId) {
      // Check access: reporter or host of the listing
      const hostRes = await db.execute(
        `SELECT hp.user_id FROM charger_listings cl
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         WHERE cl.id = $1 LIMIT 1`,
        [row['listing_id']],
      )
      const hostUserId = (hostRes.rows[0] as { user_id: string } | undefined)?.user_id
      if (row['reporter_user_id'] !== userId && hostUserId !== userId) {
        // Also allow admins (checked by caller via x-user-roles)
        throw new ForbiddenError()
      }
    }

    return this._mapRow(row)
  },

  /**
   * Returns paginated incident list.
   * If userId provided, only incidents involving that user.
   * If adminView=true, returns all incidents.
   */
  async list(
    options: {
      userId?: string
      adminView?: boolean
      status?: IncidentStatus
      severity?: IncidentSeverity
      listingId?: string
      page?: number
      pageSize?: number
    } = {},
  ): Promise<{ incidents: IncidentRow[]; total: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (options.userId && !options.adminView) {
      conditions.push(`(i.reporter_user_id = $${i} OR EXISTS (
        SELECT 1 FROM charger_listings cl
        JOIN host_profiles hp ON hp.id = cl.host_profile_id
        WHERE cl.id = i.listing_id AND hp.user_id = $${i}
      ))`)
      params.push(options.userId)
      i++
    }
    if (options.status) {
      conditions.push(`i.status = $${i++}`)
      params.push(options.status)
    }
    if (options.severity) {
      conditions.push(`i.severity = $${i++}`)
      params.push(options.severity)
    }
    if (options.listingId) {
      conditions.push(`i.listing_id = $${i++}`)
      params.push(options.listingId)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRes, rowsRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total FROM incidents i ${where}`,
        params,
      ),
      db.execute(
        `SELECT i.id, i.reporter_user_id, i.listing_id, i.booking_id, i.session_id,
                i.category, i.severity, i.status,
                i.description, i.evidence_urls, i.admin_notes,
                i.resolved_at, i.resolution_note,
                i.created_at, i.updated_at,
                cl.title AS listing_title,
                u.full_name AS reporter_name
         FROM incidents i
         JOIN charger_listings cl ON cl.id = i.listing_id
         JOIN users u ON u.id = i.reporter_user_id
         ${where}
         ORDER BY
           CASE i.severity
             WHEN 'critical' THEN 1 WHEN 'high' THEN 2
             WHEN 'medium' THEN 3 ELSE 4 END,
           i.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, pageSize, offset],
      ),
    ])

    return {
      incidents: rowsRes.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total: (countRes.rows[0] as { total: number }).total,
    }
  },

  /**
   * Admin: updates incident status and adds notes.
   */
  async updateStatus(
    incidentId: string,
    status: IncidentStatus,
    adminNotes?: string,
  ): Promise<IncidentRow> {
    const db = await getDb()
    await db.execute(
      `UPDATE incidents
       SET status = $2,
           admin_notes = COALESCE($3, admin_notes),
           updated_at = NOW()
       WHERE id = $1`,
      [incidentId, status, adminNotes ?? null],
    )
    return this.getById(incidentId)
  },

  /**
   * Resolves an incident with a resolution note.
   */
  async resolve(
    incidentId: string,
    resolutionNote: string,
    adminNotes?: string,
  ): Promise<IncidentRow> {
    const db = await getDb()
    await db.execute(
      `UPDATE incidents
       SET status = 'resolved',
           resolved_at = NOW(),
           resolution_note = $2,
           admin_notes = COALESCE($3, admin_notes),
           updated_at = NOW()
       WHERE id = $1`,
      [incidentId, resolutionNote, adminNotes ?? null],
    )
    return this.getById(incidentId)
  },

  /**
   * Escalates an incident (e.g. to legal / insurance team).
   */
  async escalate(incidentId: string, reason: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `UPDATE incidents
       SET status = 'escalated',
           admin_notes = COALESCE(admin_notes || E'\n', '') || $2,
           updated_at = NOW()
       WHERE id = $1`,
      [incidentId, `Escalated: ${reason}`],
    )
  },

  // ── Private ───────────────────────────────────────────────

  _mapRow(r: Record<string, unknown>): IncidentRow {
    return {
      id: r['id'] as string,
      reporterUserId: r['reporter_user_id'] as string,
      listingId: r['listing_id'] as string,
      bookingId: (r['booking_id'] as string | null) ?? null,
      sessionId: (r['session_id'] as string | null) ?? null,
      category: r['category'] as IncidentCategory,
      severity: r['severity'] as IncidentSeverity,
      status: r['status'] as IncidentStatus,
      description: r['description'] as string,
      evidenceUrls: (r['evidence_urls'] as string[]) ?? [],
      adminNotes: (r['admin_notes'] as string | null) ?? null,
      resolvedAt: r['resolved_at'] ? new Date(r['resolved_at'] as string) : null,
      resolutionNote: (r['resolution_note'] as string | null) ?? null,
      createdAt: new Date(r['created_at'] as string),
      updatedAt: new Date(r['updated_at'] as string),
      listingTitle: (r['listing_title'] as string | null) ?? null,
      reporterName: (r['reporter_name'] as string | null) ?? null,
    }
  },
}
