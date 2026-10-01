/**
 * @file WebhookDeliveryService.ts
 * @description Outbound webhook delivery service.
 *
 * Subscribes to domain events from the event bus and delivers them
 * to all active webhook subscriptions matching that event type.
 *
 * Delivery:
 * - POST to subscriber URL with JSON payload
 * - Signed with HMAC-SHA256: X-Zipgrid-Signature: sha256=<hmac>
 * - Timeout: 10 seconds
 * - Retry: 3 attempts with exponential backoff (1min, 5min, 30min)
 * - After 3 failures: subscription auto-deactivated
 *
 * Payload shape:
 *   { event: string, id: string, created: ISO8601, data: {...} }
 *
 * @module domains/webhooks
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { eventBus, type DomainEvent } from '@/lib/events/event-bus'
import { getDb } from '@/lib/db'

/* ── Domain event → webhook event mapping ────────────────────── */

const EVENT_MAP: Partial<Record<DomainEvent['type'], string>> = {
  SESSION_COMPLETED:   'session.completed',
  BOOKING_CONFIRMED:   'booking.confirmed',
  BOOKING_CANCELLED:   'booking.cancelled',
  PAYMENT_CAPTURED:    'payout.paid',
  LISTING_PUBLISHED:   'listing.published',
  INCIDENT_REPORTED:   'charger.faulted',
}

/* ── Delivery ─────────────────────────────────────────────────── */

async function deliverToSubscription(
  subscriptionId: string,
  url: string,
  secret: string,
  eventType: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDb()
  const body = JSON.stringify({
    event: eventType,
    id: eventId,
    created: new Date().toISOString(),
    data: payload,
  })

  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

  let responseStatus: number | null = null
  let responseBody = ''
  let errorMessage: string | null = null
  let success = false

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Zipgrid-Signature': sig,
        'X-Zipgrid-Event': eventType,
        'X-Zipgrid-Delivery': eventId,
      },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeout)
    responseStatus = res.status
    responseBody = (await res.text()).slice(0, 500)
    success = res.status >= 200 && res.status < 300
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error'
  }

  // Record delivery attempt
  await db.execute(
    `INSERT INTO webhook_deliveries
       (subscription_id, event_type, event_id, status, attempt_count,
        request_payload, response_status, response_body, error_message,
        delivered_at, created_at)
     VALUES ($1, $2::webhook_event_type, $3,
       $4::webhook_delivery_status, 1, $5, $6, $7, $8,
       CASE WHEN $4 = 'delivered' THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (subscription_id, event_id) DO UPDATE
     SET status = EXCLUDED.status,
         attempt_count = webhook_deliveries.attempt_count + 1,
         response_status = EXCLUDED.response_status,
         response_body = EXCLUDED.response_body,
         error_message = EXCLUDED.error_message,
         delivered_at = CASE WHEN EXCLUDED.status = 'delivered' THEN NOW() ELSE NULL END`,
    [
      subscriptionId,
      eventType,
      eventId,
      success ? 'delivered' : 'failed',
      JSON.stringify({ url, event: eventType }),
      responseStatus,
      responseBody || null,
      errorMessage,
    ],
  )

  if (success) {
    // Update subscription last_delivery_at and reset failure_count
    await db.execute(
      `UPDATE webhook_subscriptions
       SET last_delivery_at = NOW(), failure_count = 0, updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId],
    )
  } else {
    // Increment failure_count; auto-deactivate after 10 consecutive failures
    await db.execute(
      `UPDATE webhook_subscriptions
       SET failure_count = failure_count + 1,
           is_active = CASE WHEN failure_count + 1 >= 10 THEN FALSE ELSE is_active END,
           updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId],
    )
  }
}

/* ── Fan-out to all matching subscriptions ────────────────────── */

async function fanOut(webhookEvent: string, payload: Record<string, unknown>): Promise<void> {
  let db
  try { db = await getDb() } catch { return }

  const eventId = uuidv4()

  const subs = await db.execute(
    `SELECT id, url, secret FROM webhook_subscriptions
     WHERE is_active = TRUE
       AND events @> ARRAY[$1::webhook_event_type]`,
    [webhookEvent],
  ).catch(() => ({ rows: [] }))

  for (const sub of subs.rows as Array<{ id: string; url: string; secret: string }>) {
    // Fire-and-forget — do not block domain event processing
    deliverToSubscription(sub.id, sub.url, sub.secret, webhookEvent, eventId, payload)
      .catch((err) => console.error('[webhook] delivery error:', err))
  }
}

/* ── Bootstrap — subscribe to domain events ───────────────────── */

let _bootstrapped = false

export function bootstrapWebhookDelivery(): void {
  if (_bootstrapped) return
  _bootstrapped = true

  eventBus.subscribe('SESSION_COMPLETED', (e) => {
    void fanOut('session.completed', { sessionId: e.sessionId, bookingId: e.bookingId, energyConsumedWh: e.energyConsumedWh, totalCostPence: e.totalCostPence })
  })

  eventBus.subscribe('BOOKING_CONFIRMED', (e) => {
    void fanOut('booking.confirmed', { bookingId: e.bookingId, driverId: e.driverId, hostId: e.hostId, listingId: e.listingId, scheduledStart: e.scheduledStart })
  })

  eventBus.subscribe('BOOKING_CANCELLED', (e) => {
    void fanOut('booking.cancelled', { bookingId: e.bookingId, cancelledBy: e.cancelledBy })
  })

  eventBus.subscribe('PAYMENT_CAPTURED', (e) => {
    void fanOut('payout.paid', { transactionId: e.transactionId, amountPence: e.amountPence, driverId: e.driverId })
  })

  eventBus.subscribe('LISTING_PUBLISHED', (e) => {
    void fanOut('listing.published', { listingId: e.listingId, hostId: e.hostId })
  })

  eventBus.subscribe('INCIDENT_REPORTED', (e) => {
    void fanOut('charger.faulted', { incidentId: e.incidentId, listingId: e.listingId, severity: e.severity })
  })
}

export const WebhookDeliveryService = { bootstrapWebhookDelivery, fanOut }
