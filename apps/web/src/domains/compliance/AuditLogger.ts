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

import { isIP } from 'node:net'
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
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
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
    const page = Math.max(1, options.page ?? 1)
    const pageSize = Math.min(Math.max(1, options.pageSize ?? 50), 200)

    const conditions: string[] = []
    const values: unknown[] = []
    const add = (sql: string, value: unknown) => {
      values.push(value)
      conditions.push(sql.replace('?', `$${values.length}`))
    }
    if (options.actorId) add('actor_user_id = ?', options.actorId)
    if (options.targetId) add('entity_id = ?', options.targetId)
    if (options.eventType) add('action = ?', options.eventType)
    if (options.from) add('occurred_at >= ?', options.from.toISOString())
    if (options.to) add('occurred_at < ?', options.to.toISOString())
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRes, rowsRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM audit_log ${where}`, values),
      db.execute(
        `SELECT id, action, actor_user_id, entity_id, entity_type,
                actor_ip, actor_user_agent, metadata, occurred_at
         FROM audit_log ${where}
         ORDER BY occurred_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ])

    return {
      entries: rowsRes.rows.map((r) => this._mapRow(r)),
      total: Number((countRes.rows[0] as { total: number }).total),
    }
  },

  // ── Private ───────────────────────────────────────────────

  async _write(input: LogInput): Promise<void> {
    // entity_id is a UUID column; non-UUID targets are kept in metadata.
    const targetIsUuid = input.targetId !== undefined && UUID_RE.test(input.targetId)
    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.targetId && !targetIsUuid ? { targetRef: input.targetId } : {}),
    }
    try {
      const db = await getDb()
      await db.execute(
        `INSERT INTO audit_log (
           action, actor_user_id, entity_type, entity_id,
           actor_ip, actor_user_agent, old_values, new_values, metadata
         ) VALUES ($1, $2, $3, $4, $5::inet, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
        [
          input.eventType,
          input.actorId ?? null,
          input.targetType ?? 'system',
          targetIsUuid ? input.targetId : null,
          input.ipAddress && isIp(input.ipAddress) ? input.ipAddress : null,
          input.userAgent ?? null,
          input.oldValues ? JSON.stringify(input.oldValues) : null,
          input.newValues ? JSON.stringify(input.newValues) : null,
          JSON.stringify(metadata),
        ],
      )
    } catch (err) {
      // Never break the caller, but never fail silently either.
      console.error('[AuditLogger] write failed', input.eventType, err)
    }
  },

  _mapRow(r: Record<string, unknown>): AuditEntry {
    const metadata = (r['metadata'] as Record<string, unknown> | null) ?? {}
    return {
      id: String(r['id']),
      eventType: r['action'] as string,
      actorId: (r['actor_user_id'] as string | null) ?? null,
      targetId: (r['entity_id'] as string | null) ?? (metadata['targetRef'] as string | undefined) ?? null,
      targetType: (r['entity_type'] as string | null) ?? null,
      ipAddress: (r['actor_ip'] as string | null) ?? null,
      userAgent: (r['actor_user_agent'] as string | null) ?? null,
      metadata,
      createdAt: new Date(r['occurred_at'] as string),
    }
  },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isIp = (v: string) => isIP(v) !== 0

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
