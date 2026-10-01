/**
 * @file GdprService.ts
 * @description GDPR compliance service — data export, deletion requests, consent management.
 *
 * UK GDPR obligations implemented:
 *   Art. 17 — Right to erasure (deletion requests)
 *   Art. 20 — Right to portability (data export)
 *   Art. 7   — Consent management (record, withdraw, check)
 *   Art. 30  — Processing records (via AuditLogger)
 *
 * Data export produces a JSON archive of all personal data for a user.
 * Deletion anonymises PII rather than hard-deleting rows to maintain
 * referential integrity for billing/legal retention obligations.
 *
 * Retention rules (aligned with UK GDPR + HMRC):
 *   - Transaction records: 7 years (HMRC requirement)
 *   - Session energy data: 2 years
 *   - Audit logs: 5 years
 *   - Personal data (name, email): anonymised on deletion request
 *
 * @module domains/compliance
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { AuditLogger } from './AuditLogger'

/* ── Types ─────────────────────────────────────────────────── */

export type ConsentPurpose =
  | 'marketing_email'
  | 'marketing_sms'
  | 'analytics'
  | 'personalisation'
  | 'third_party_sharing'

export type ConsentRecord = {
  userId: string
  purpose: ConsentPurpose
  granted: boolean
  ipAddress: string | null
  userAgent: string | null
  recordedAt: Date
  withdrawnAt: Date | null
}

export type DeletionRequest = {
  id: string
  userId: string
  reason: string | null
  status: 'pending' | 'processing' | 'completed' | 'rejected'
  scheduledFor: Date
  completedAt: Date | null
  createdAt: Date
}

export type DataExport = {
  exportedAt: string
  userId: string
  profile: Record<string, unknown>
  bookings: unknown[]
  sessions: unknown[]
  transactions: unknown[]
  walletTransactions: unknown[]
  notifications: unknown[]
  reviews: unknown[]
  consentHistory: unknown[]
}

/* ── Service ────────────────────────────────────────────────── */

export const GdprService = {

  // ── Consent management ────────────────────────────────────

  /**
   * Records a consent decision for a user.
   * Upserts the record — calling again with granted=false withdraws consent.
   */
  async recordConsent(
    userId: string,
    purpose: ConsentPurpose,
    granted: boolean,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<void> {
    const db = await getDb()

    await db.execute(
      `INSERT INTO consent_records (
         id, user_id, purpose, granted, ip_address, user_agent,
         recorded_at, withdrawn_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
       ON CONFLICT (user_id, purpose) DO UPDATE
         SET granted      = EXCLUDED.granted,
             ip_address   = EXCLUDED.ip_address,
             user_agent   = EXCLUDED.user_agent,
             recorded_at  = NOW(),
             withdrawn_at = CASE WHEN EXCLUDED.granted = false THEN NOW() ELSE NULL END`,
      [
        uuidv4(),
        userId,
        purpose,
        granted,
        meta.ipAddress ?? null,
        meta.userAgent ?? null,
        granted ? null : new Date().toISOString(),
      ],
    )

    const logInput: Parameters<typeof AuditLogger.log>[0] = {
      eventType: granted ? 'consent.granted' : 'consent.withdrawn',
      actorId: userId,
      targetId: userId,
      targetType: 'user',
      metadata: { purpose, granted },
    }
    if (meta.ipAddress !== undefined) logInput.ipAddress = meta.ipAddress
    AuditLogger.log(logInput)
  },

  /**
   * Returns the current consent state for all purposes for a user.
   */
  async getConsent(userId: string): Promise<Record<ConsentPurpose, boolean>> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT purpose, granted FROM consent_records WHERE user_id = $1`,
      [userId],
    )

    const defaults: Record<ConsentPurpose, boolean> = {
      marketing_email:     false,
      marketing_sms:       false,
      analytics:           true,   // analytics on by default (legitimate interest)
      personalisation:     true,
      third_party_sharing: false,
    }

    for (const row of res.rows) {
      const r = row as { purpose: string; granted: boolean }
      if (r.purpose in defaults) {
        defaults[r.purpose as ConsentPurpose] = r.granted
      }
    }

    return defaults
  },

  // ── Data export (Art. 20) ─────────────────────────────────

  /**
   * Produces a full JSON export of all personal data for a user.
   * Intended for download as a .json file.
   *
   * Runs 7 parallel queries — performance is acceptable since this is a
   * user-triggered action (not a hot path).
   */
  async exportData(userId: string): Promise<DataExport> {
    const db = await getDb()

    const [
      profileRes, bookingsRes, sessionsRes,
      txRes, walletRes, notifRes, reviewRes, consentRes,
    ] = await Promise.all([
      db.execute(
        `SELECT id, email, display_name, phone_number, kyc_status,
                roles, ai_mode, created_at
         FROM users WHERE id = $1`,
        [userId],
      ),
      db.execute(
        `SELECT b.id, b.status, b.scheduled_start, b.scheduled_end,
                b.estimated_cost_cents, b.created_at,
                cl.title AS listing_title, cl.city
         FROM bookings b
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE dp.user_id = $1
         ORDER BY b.created_at DESC`,
        [userId],
      ),
      db.execute(
        `SELECT cs.id, cs.status, cs.energy_consumed_wh, cs.total_cost_pence,
                cs.started_at, cs.ended_at, cs.duration_minutes,
                cl.title AS listing_title
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE dp.user_id = $1
         ORDER BY cs.started_at DESC`,
        [userId],
      ),
      db.execute(
        `SELECT t.id, t.status, t.total_charged_cents, t.created_at
         FROM transactions t
         JOIN bookings b ON b.id = t.booking_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE dp.user_id = $1
         ORDER BY t.created_at DESC`,
        [userId],
      ),
      db.execute(
        `SELECT id, type, amount_pence, balance_after_pence, description, created_at
         FROM wallet_transactions WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      ),
      db.execute(
        `SELECT id, category, title, is_read, created_at
         FROM notifications WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 200`,
        [userId],
      ),
      db.execute(
        `SELECT r.id, r.overall_rating, r.comment, r.created_at,
                cl.title AS listing_title
         FROM reviews r
         LEFT JOIN charger_listings cl ON cl.id = r.listing_id
         WHERE r.reviewer_user_id = $1
         ORDER BY r.created_at DESC`,
        [userId],
      ),
      db.execute(
        `SELECT purpose, granted, recorded_at, withdrawn_at
         FROM consent_records WHERE user_id = $1
         ORDER BY recorded_at DESC`,
        [userId],
      ),
    ])

    if (profileRes.rows.length === 0) throw new NotFoundError('User', userId)

    await AuditLogger.logAsync({
      eventType: 'gdpr.data_export',
      actorId: userId,
      targetId: userId,
      targetType: 'user',
    })

    return {
      exportedAt:        new Date().toISOString(),
      userId,
      profile:           profileRes.rows[0] as Record<string, unknown>,
      bookings:          bookingsRes.rows,
      sessions:          sessionsRes.rows,
      transactions:      txRes.rows,
      walletTransactions: walletRes.rows,
      notifications:     notifRes.rows,
      reviews:           reviewRes.rows,
      consentHistory:    consentRes.rows,
    }
  },

  // ── Deletion requests (Art. 17) ───────────────────────────

  /**
   * Submits a deletion request for a user account.
   * The actual deletion is processed asynchronously after a 30-day
   * cooling-off period (allows chargebacks, disputes to settle).
   *
   * @throws {ValidationError} if the user has open bookings or disputes
   */
  async requestDeletion(
    userId: string,
    reason?: string,
  ): Promise<DeletionRequest> {
    const db = await getDb()

    // Check for active bookings — cannot delete with in-progress sessions
    const activeBookingsRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt
       FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1
         AND b.status IN ('confirmed', 'active')`,
      [userId],
    )
    if ((activeBookingsRes.rows[0] as { cnt: number }).cnt > 0) {
      throw new ValidationError(
        'You have active or upcoming bookings. Please cancel them before requesting account deletion.',
      )
    }

    // Check for existing pending deletion request
    const existingRes = await db.execute(
      `SELECT id FROM gdpr_deletion_requests
       WHERE user_id = $1 AND status NOT IN ('completed','rejected')
       LIMIT 1`,
      [userId],
    )
    if (existingRes.rows.length > 0) {
      throw new ValidationError('A deletion request is already pending for this account.')
    }

    const requestId   = uuidv4()
    // 30-day cooling-off period
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await db.execute(
      `INSERT INTO gdpr_deletion_requests
         (id, user_id, reason, status, scheduled_for, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW())`,
      [requestId, userId, reason ?? null, scheduledFor.toISOString()],
    )

    await AuditLogger.logAsync({
      eventType: 'gdpr.deletion_requested',
      actorId: userId,
      targetId: userId,
      targetType: 'user',
      metadata: { scheduledFor: scheduledFor.toISOString() },
    })

    return {
      id:          requestId,
      userId,
      reason:      reason ?? null,
      status:      'pending',
      scheduledFor,
      completedAt: null,
      createdAt:   new Date(),
    }
  },

  /**
   * Admin: processes a deletion request — anonymises PII while preserving
   * financial records required for legal/tax retention.
   *
   * PII removed:
   *   - name, email → anonymised
   *   - phone number → nulled
   *   - avatar URL → nulled
   *   - password hash → cleared
   *
   * Retained (legal basis: legitimate interest / tax compliance):
   *   - transaction records (7 years)
   *   - booking IDs and session energy data (2 years)
   *   - audit log entries (5 years)
   */
  async processDeletion(requestId: string): Promise<void> {
    const db = await getDb()

    const reqRes = await db.execute(
      `SELECT id, user_id, status FROM gdpr_deletion_requests WHERE id = $1 LIMIT 1`,
      [requestId],
    )
    if (reqRes.rows.length === 0) throw new NotFoundError('Deletion request', requestId)

    const req = reqRes.rows[0] as { id: string; user_id: string; status: string }
    if (req.status !== 'pending') {
      throw new ValidationError(`Deletion request is already ${req.status}.`)
    }

    const userId    = req.user_id
    const anonymId  = `deleted-${uuidv4().slice(0, 8)}`

    // Anonymise user PII
    await db.execute(
      `UPDATE users
       SET email         = $2,
           display_name  = 'Deleted User',
           full_name     = 'Deleted User',
           phone_number  = NULL,
           avatar_url    = NULL,
           password_hash = '',
           deleted_at    = NOW(),
           updated_at    = NOW()
       WHERE id = $1`,
      [userId, `${anonymId}@deleted.zipgrid.internal`],
    )

    // Soft-delete driver & host profiles
    await db.execute(
      `UPDATE driver_profiles SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
      [userId],
    )
    await db.execute(
      `UPDATE host_profiles SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
      [userId],
    )

    // Remove notification content (keep shell for reference integrity)
    await db.execute(
      `UPDATE notifications SET title = '[Deleted]', body = '[Deleted]', updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    )

    // Mark request completed
    await db.execute(
      `UPDATE gdpr_deletion_requests
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [requestId],
    )

    await AuditLogger.logAsync({
      eventType: 'gdpr.deletion_completed',
      actorId: 'system',
      targetId: userId,
      targetType: 'user',
      metadata: { requestId, anonymisedAs: anonymId },
    })
  },

  /**
   * Returns the deletion request for a user (if any).
   */
  async getDeletionRequest(userId: string): Promise<DeletionRequest | null> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, user_id, reason, status, scheduled_for, completed_at, created_at
       FROM gdpr_deletion_requests
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    if (res.rows.length === 0) return null
    const r = res.rows[0] as Record<string, unknown>
    return {
      id:          r['id'] as string,
      userId:      r['user_id'] as string,
      reason:      (r['reason'] as string | null) ?? null,
      status:      r['status'] as DeletionRequest['status'],
      scheduledFor: new Date(r['scheduled_for'] as string),
      completedAt: r['completed_at'] ? new Date(r['completed_at'] as string) : null,
      createdAt:   new Date(r['created_at'] as string),
    }
  },
}
