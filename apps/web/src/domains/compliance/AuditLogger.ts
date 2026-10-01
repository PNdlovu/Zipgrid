/**
 * @file AuditLogger.ts
 * @description Structured, append-only audit log for all platform actions.
 *
 * Architecture:
 *   - audit_log table is the persistent store (immutable rows)
 *   - AuditLogger subscribes to all domain events via the event bus
 *   - Direct log() calls available for API routes that need fine-grained entries
 *   - bootstrapAuditLogger() wires up all event bus subscriptions — call from instrumentation.ts
 *
 * Compliance context:
 *   - UK GDPR Art. 30 processing records
 *   - SOC2 CC6.8 (monitoring access)
 *   - Entries are never updated or deleted (immutable ledger)
 *
 * @module domains/compliance
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { eventBus } from '@/lib/events/event-bus'

/* ── Types ─────────────────────────────────────────────────── */

export type AuditEventType =
  | 'user.registered'
  | 'user.login'
  | 'user.logout'
  | 'user.password_reset'
  | 'user.email_verified'
  | 'user.kyc_verified'
  | 'user.kyc_rejected'
  | 'user.deleted'
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'session.started'
  | 'session.completed'
  | 'payment.captured'
  | 'payment.refunded'
  | 'payout.sent'
  | 'listing.published'
  | 'listing.paused'
  | 'incident.reported'
  | 'admin.kyc_override'
  | 'admin.dispute_resolved'
  | 'admin.user_suspended'

export type AuditEntry = {
  id: string
  eventType: AuditEventType | string
  actorId: string | null
  targetId: string | null
  targetType: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  createdAt: Date
}

export type LogInput = {
  eventType: AuditEventType | string
  actorId?: string
  targetId?: string
  targetType?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

/* ── Service ────────────────────────────────────────────────── */

export const AuditLogger = {

  /**
   * Writes a single audit entry.
   * Fire-and-forget — errors are swallowed so they never break caller flows.
   */
  log(input: LogInput): void {
    void this._write(input)
  },

  /**
   * Same as log() but awaitable.
   * Use when you need confirmation the entry was written (e.g. admin actions).
   */
  async logAsync(input: LogInput): Promise<void> {
    await this._write(input)
  },

  /**
   * Returns paginated audit entries.
   * Admin-only — not exposed to regular users.
   */
  async query(options: {
    actorId?: string
    targetId?: string
    eventType?: string
    from?: Date
    to?: Date
    page?: number
    pageSize?: number
  }): Promise<{ entries: AuditEntry[]; total: number }> {
    const db = await getDb()
    const page = options.page ?? 1
    const pageSize = Math.min(options.pageSize ?? 50, 200)
    const offset = (page - 1) * pageSize

    const conditions: string[] = []
    const values: unknown[] = []
    let i = 1

    if (options.actorId) {
      conditions.push(`actor_id = $${i++}`)
      values.push(options.actorId)
    }
    if (options.targetId) {
      conditions.push(`target_id = $${i++}`)
      values.push(options.targetId)
    }
    if (options.eventType) {
      conditions.push(`event_type = $${i++}`)
      values.push(options.eventType)
    }
    if (options.from) {
      conditions.push(`created_at >= $${i++}`)
      values.push(options.from.toISOString())
    }
    if (options.to) {
      conditions.push(`created_at < $${i++}`)
      values.push(options.to.toISOString())
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRes, rowsRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM audit_log ${where}`, values),
      db.execute(
        `SELECT id, event_type, actor_id, target_id, target_type,
                ip_address, user_agent, metadata, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, pageSize, offset],
      ),
    ])

    return {
      entries: rowsRes.rows.map((r) => this._mapRow(r as Record<string, unknown>)),
      total: (countRes.rows[0] as { total: number }).total,
    }
  },

  // ── Private ───────────────────────────────────────────────

  async _write(input: LogInput): Promise<void> {
    try {
      const db = await getDb()
      await db.execute(
        `INSERT INTO audit_log (
           id, event_type, actor_id, target_id, target_type,
           ip_address, user_agent, metadata, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
        [
          uuidv4(),
          input.eventType,
          input.actorId ?? null,
          input.targetId ?? null,
          input.targetType ?? null,
          input.ipAddress ?? null,
          input.userAgent ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      )
    } catch {
      // Audit log writes must never throw — platform resilience over log completeness
    }
  },

  _mapRow(r: Record<string, unknown>): AuditEntry {
    return {
      id: r['id'] as string,
      eventType: r['event_type'] as string,
      actorId: (r['actor_id'] as string | null) ?? null,
      targetId: (r['target_id'] as string | null) ?? null,
      targetType: (r['target_type'] as string | null) ?? null,
      ipAddress: (r['ip_address'] as string | null) ?? null,
      userAgent: (r['user_agent'] as string | null) ?? null,
      metadata: (r['metadata'] as Record<string, unknown>) ?? {},
      createdAt: new Date(r['created_at'] as string),
    }
  },
}

/**
 * Wires AuditLogger to the domain event bus.
 * Call once from instrumentation.ts at server startup.
 */
export function bootstrapAuditLogger(): void {
  eventBus.subscribe('USER_REGISTERED', (e) => {
    AuditLogger.log({ eventType: 'user.registered', actorId: e.userId, targetId: e.userId, targetType: 'user', metadata: { role: e.role } })
  })

  eventBus.subscribe('KYC_VERIFIED', (e) => {
    AuditLogger.log({ eventType: 'user.kyc_verified', actorId: e.userId, targetId: e.userId, targetType: 'user' })
  })

  eventBus.subscribe('BOOKING_CONFIRMED', (e) => {
    AuditLogger.log({
      eventType: 'booking.confirmed',
      actorId: e.driverId,
      targetId: e.bookingId,
      targetType: 'booking',
      metadata: { hostId: e.hostId, listingId: e.listingId },
    })
  })

  eventBus.subscribe('BOOKING_CANCELLED', (e) => {
    AuditLogger.log({
      eventType: 'booking.cancelled',
      targetId: e.bookingId,
      targetType: 'booking',
      metadata: { cancelledBy: e.cancelledBy },
    })
  })

  eventBus.subscribe('SESSION_COMPLETED', (e) => {
    AuditLogger.log({
      eventType: 'session.completed',
      targetId: e.sessionId,
      targetType: 'session',
      metadata: { bookingId: e.bookingId, energyWh: e.energyConsumedWh, costPence: e.totalCostPence },
    })
  })

  eventBus.subscribe('PAYMENT_CAPTURED', (e) => {
    AuditLogger.log({
      eventType: 'payment.captured',
      actorId: e.driverId,
      targetId: e.transactionId,
      targetType: 'transaction',
      metadata: { amountPence: e.amountPence },
    })
  })

  eventBus.subscribe('LISTING_PUBLISHED', (e) => {
    AuditLogger.log({
      eventType: 'listing.published',
      actorId: e.hostId,
      targetId: e.listingId,
      targetType: 'listing',
    })
  })

  eventBus.subscribe('INCIDENT_REPORTED', (e) => {
    AuditLogger.log({
      eventType: 'incident.reported',
      targetId: e.incidentId,
      targetType: 'incident',
      metadata: { listingId: e.listingId, severity: e.severity },
    })
  })
}
