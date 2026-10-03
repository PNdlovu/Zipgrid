/**
 * @file StopTransaction.ts
 * @description OCPP 1.6J StopTransaction handler.
 *
 * Records the final meter reading and end time, prices the session with the
 * shared tariff engine (energy = meterStop − meterStart), marks it completed
 * and asks the web platform to settle payment. This service never touches
 * payment state — settlement (Stripe capture) is owned by the web platform,
 * which also retries via cron if this notification is lost.
 *
 * @module apps/ocpp-service/handlers/actions
 */

import type { WebSocket } from 'ws'
import { calculateSessionCost, meterDeltaWh, type PricingModel } from '@zipgrid/utils'
import { getDb } from '../db'
import { logOcppEvent, parseTimestamp, reply } from '../common'
import { logger } from '../../lib/logger'
import { notifyPlatform } from '../../lib/platform'

export async function handleStopTransaction(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const transactionId = Number(payload['transactionId'])
  const meterStop = Math.max(0, Math.round(Number(payload['meterStop'] ?? 0)))
  const reason = (payload['reason'] as string | undefined) ?? 'Local'
  const endedAt = parseTimestamp(payload['timestamp'])

  let completedSessionId: string | null = null

  try {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, started_at, meter_start_wh,
              pricing_model, price_per_kwh_cents, price_per_hour_cents,
              price_per_session_cents, idle_fee_per_min_cents
       FROM charging_sessions
       WHERE charge_point_id = $1 AND ocpp_transaction_id = $2
         AND status IN ('charging', 'paused', 'finishing')
       LIMIT 1`,
      [chargePointId, transactionId],
    )
    const s = res.rows[0]

    if (!s) {
      logger.warn({ chargePointId, transactionId }, 'StopTransaction: no live session')
    } else {
      const startedAt = s['started_at'] ? new Date(s['started_at'] as string) : null
      const meterStart = s['meter_start_wh'] != null ? Number(s['meter_start_wh']) : null
      const energyWh = meterDeltaWh(meterStart, meterStop)
      const cost = calculateSessionCost({
        tariff: {
          pricingModel: (s['pricing_model'] as PricingModel | null) ?? 'per_kwh',
          pricePerKwhPence: s['price_per_kwh_cents'] as number | null,
          pricePerHourPence: s['price_per_hour_cents'] as number | null,
          pricePerSessionPence: s['price_per_session_cents'] as number | null,
          idleFeePerMinPence: Number(s['idle_fee_per_min_cents'] ?? 0),
        },
        energyWh,
        startedAt,
        endedAt,
      })

      await db.execute(
        `UPDATE charging_sessions
         SET status = 'completed',
             meter_stop_wh = GREATEST($2, COALESCE(meter_start_wh, 0)),
             ended_at = $3,
             duration_minutes = $4,
             stop_reason = $5,
             power_w = 0,
             energy_cost_cents = $6,
             idle_fee_cents = $7,
             total_session_cost_cents = $8,
             updated_at = NOW()
         WHERE id = $1`,
        [
          s['id'], meterStop, endedAt.toISOString(),
          startedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000) : 0,
          reason,
          cost.energyPence + cost.timePence + cost.sessionFeePence,
          cost.idleFeePence,
          cost.totalPence,
        ],
      )
      completedSessionId = s['id'] as string
      logger.info(
        { chargePointId, sessionId: completedSessionId, energyWh, totalPence: cost.totalPence },
        'Session completed',
      )
    }

    await logOcppEvent({
      chargePointId,
      eventType: 'StopTransaction',
      payload: { meterStop, reason, sessionId: completedSessionId },
      transactionId,
      timestamp: endedAt,
    })
  } catch (err) {
    logger.error({ chargePointId, transactionId, err }, 'Error processing StopTransaction')
  }

  reply(ws, uniqueId, { idTagInfo: { status: 'Accepted' } })

  if (completedSessionId) {
    void notifyPlatform({ event: 'session.completed', sessionId: completedSessionId })
  }
}
