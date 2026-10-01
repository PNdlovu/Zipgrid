/**
 * @file route.ts
 * @description POST /api/v1/webhooks/ocpp
 * Receives session lifecycle events from the OCPP service.
 * Authenticated via shared OCPP_SERVICE_SECRET.
 *
 * Events handled:
 *   session.completed — triggers rewards earn, notification, payout scheduling flag
 *
 * @module apps/web/api/v1/webhooks/ocpp
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eventBus } from '@/lib/events/event-bus'

const EventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('session.completed'),
    sessionId: z.string().uuid(),
    bookingId: z.string().uuid(),
    energyWh: z.number().nonnegative(),
    totalCostPence: z.number().nonnegative(),
  }),
])

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = EventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event payload' }, { status: 422 })
  }

  const ev = parsed.data

  if (ev.event === 'session.completed') {
    // Publish to the in-process event bus — AuditLogger and RewardEventHandlers
    // are already subscribed and will fire automatically
    eventBus.publish({
      type: 'SESSION_COMPLETED',
      sessionId: ev.sessionId,
      bookingId: ev.bookingId,
      energyConsumedWh: ev.energyWh,
      totalCostPence: ev.totalCostPence,
    })

    // Also trigger in-app notification for the driver (best-effort)
    try {
      const { getDb } = await import('@/lib/db')
      const db = await getDb()

      const res = await db.execute(
        `SELECT dp.user_id
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE cs.id = $1 LIMIT 1`,
        [ev.sessionId],
      )

      if (res.rows.length > 0) {
        const { NotificationService } = await import('@/domains/notifications/NotificationService')
        await NotificationService.notifySessionCompleted({
          driverUserId: (res.rows[0] as { user_id: string }).user_id,
          sessionId: ev.sessionId,
          energyConsumedWh: ev.energyWh,
          totalCostPence: ev.totalCostPence,
        })
      }
    } catch {
      // Swallow — notification is best-effort; session state is already correct
    }
  }

  return NextResponse.json({ received: true })
}
