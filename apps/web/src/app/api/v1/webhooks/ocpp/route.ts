/**
 * @file route.ts
 * @description POST /api/v1/webhooks/ocpp — events from the OCPP service.
 * Authenticated with the shared OCPP_SERVICE_SECRET (Bearer).
 *
 *   session.completed — settle payment (capture/release hold), publish
 *                       SESSION_COMPLETED (rewards, audit), notify the driver
 *   charger.faulted   — notify the host
 *
 * Settlement is idempotent, so retries from the OCPP service are safe.
 *
 * @module apps/web/api/v1/webhooks/ocpp
 */

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { hasValidServiceSecret } from '@/lib/env'
import { eventBus } from '@/lib/events/event-bus'
import { SettlementService } from '@/domains/payments/SettlementService'
import { NotificationService } from '@/domains/notifications/NotificationService'

const EventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('session.completed'), sessionId: z.string().uuid() }),
  z.object({
    event: z.literal('charger.faulted'),
    chargePointId: z.string().min(1).max(100),
    connectorId: z.number().int().nonnegative(),
    errorCode: z.string().max(100),
  }),
])

/** POST /api/v1/webhooks/ocpp — events from the OCPP service. */
export async function POST(request: NextRequest) {
  if (!hasValidServiceSecret(request.headers, 'OCPP_SERVICE_SECRET')) {
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
  const db = await getDb()

  if (ev.event === 'session.completed') {
    const res = await db.execute(
      `SELECT cs.booking_id, cs.energy_consumed_wh, cs.total_session_cost_cents, dp.user_id AS driver_user_id
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE cs.id = $1 AND cs.status = 'completed'`,
      [ev.sessionId],
    )
    const s = res.rows[0]
    if (!s) return NextResponse.json({ error: 'Session not found or not completed' }, { status: 404 })

    const outcome = await SettlementService.settleSession(ev.sessionId)

    // Downstream effects only on the first successful settlement.
    if (outcome.status === 'captured' || outcome.status === 'released') {
      const energyWh = Number(s['energy_consumed_wh'] ?? 0)
      const totalCostPence = Number(s['total_session_cost_cents'] ?? 0)
      eventBus.publish({
        type: 'SESSION_COMPLETED',
        sessionId: ev.sessionId,
        bookingId: s['booking_id'] as string,
        energyConsumedWh: energyWh,
        totalCostPence,
      })
      await NotificationService.notifySessionCompleted({
        driverUserId: s['driver_user_id'] as string,
        sessionId: ev.sessionId,
        energyConsumedWh: energyWh,
        totalCostPence,
      }).catch((err: unknown) => console.error('[webhooks/ocpp] notification failed', err))
    }

    // 'failed' is retried by the settlement cron; report it but don't make the
    // OCPP service retry (the session itself is recorded correctly).
    return NextResponse.json({ received: true, settlement: outcome.status })
  }

  // charger.faulted — tell the host which charger needs attention.
  const host = await db.execute(
    `SELECT hp.user_id FROM charger_devices cd
     JOIN host_profiles hp ON hp.id = cd.host_profile_id
     WHERE cd.charge_point_id = $1`,
    [ev.chargePointId],
  )
  const hostUserId = host.rows[0]?.['user_id'] as string | undefined
  if (hostUserId) {
    await NotificationService.send({
      userId: hostUserId,
      category: 'charger_fault',
      title: 'Charger fault detected',
      body: `Charger ${ev.chargePointId} (connector ${ev.connectorId}) reported ${ev.errorCode}.`,
      actionUrl: '/chargers/health',
      channels: ['in_app', 'email'],
    }).catch((err: unknown) => console.error('[webhooks/ocpp] fault notification failed', err))
  }
  return NextResponse.json({ received: true })
}
