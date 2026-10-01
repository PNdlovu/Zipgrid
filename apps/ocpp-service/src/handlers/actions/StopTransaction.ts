/**
 * @file StopTransaction.ts
 * @description OCPP 1.6J StopTransaction handler.
 * Called by the charger when a transaction ends (cable unplugged, remote stop,
 * emergency stop, local stop, EV-side stop).
 *
 * Flow:
 * 1. Find the active session by transactionId + chargePointId
 * 2. Notify the platform web API to finalise the session (cost calc, Stripe capture)
 * 3. Respond Accepted
 *
 * @module apps/ocpp-service/handlers/actions
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import { OcppMessageType } from '@zipgrid/types'
import { getDb } from '../db'
import { logger } from '../../lib/logger'

export async function handleStopTransaction(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const transactionId = Number(payload['transactionId'])
  const meterStop = Number(payload['meterStop'] ?? 0)    // Wh
  const reason = (payload['reason'] as string | null) ?? 'Local'
  const timestamp = payload['timestamp']
    ? new Date(payload['timestamp'] as string)
    : new Date()

  logger.info({ chargePointId, transactionId, meterStop, reason }, 'StopTransaction')

  try {
    const db = await getDb()

    // Find the session
    const sessionRes = await db.execute(
      `SELECT id, booking_id, pricing_model,
              price_per_kwh_cents, started_at,
              idle_fee_per_min_cents
       FROM charging_sessions
       WHERE charge_point_id = $1
         AND ocpp_transaction_id = $2
         AND status IN ('charging', 'paused', 'finishing')
       LIMIT 1`,
      [chargePointId, transactionId],
    )

    if (sessionRes.rows.length === 0) {
      logger.warn({ chargePointId, transactionId }, 'StopTransaction: no active session found')
    } else {
      const session = sessionRes.rows[0] as {
        id: string
        booking_id: string
        pricing_model: string
        price_per_kwh_cents: number
        started_at: string | null
        idle_fee_per_min_cents: number
      }

      // Calculate final cost inline (duplicates SessionService logic to avoid circular deps)
      const startedAt = session.started_at ? new Date(session.started_at) : null
      const endedAt = timestamp
      const durationMinutes = startedAt
        ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000)
        : 0

      let finalCostPence = 0
      if (session.pricing_model === 'per_kwh') {
        finalCostPence = Math.round((meterStop / 1000) * session.price_per_kwh_cents)
      } else if (session.pricing_model === 'per_hour' && startedAt) {
        finalCostPence = Math.round((durationMinutes / 60) * session.price_per_kwh_cents)
      } else if (session.pricing_model === 'per_session') {
        finalCostPence = session.price_per_kwh_cents
      }

      const platformFeePence = Math.round(finalCostPence * 0.15)

      // Update session
      await db.execute(
        `UPDATE charging_sessions
         SET status = 'completed',
             energy_consumed_wh = $2,
             total_cost_pence = $3,
             power_w = 0,
             ended_at = $4,
             duration_minutes = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [session.id, meterStop, finalCostPence, endedAt.toISOString(), durationMinutes],
      )

      // Update booking to completed
      await db.execute(
        `UPDATE bookings
         SET status = 'completed', completed_at = $2, updated_at = NOW()
         WHERE id = $1`,
        [session.booking_id, endedAt.toISOString()],
      )

      // Update transaction with final amounts
      await db.execute(
        `UPDATE transactions
         SET status = 'captured',
             total_charged_cents = $2,
             platform_fee_cents = $3,
             host_earnings_cents = $4,
             captured_at = NOW(),
             updated_at = NOW()
         WHERE booking_id = $1 AND status = 'hold_placed'`,
        [session.booking_id, finalCostPence, platformFeePence, finalCostPence - platformFeePence],
      )

      logger.info(
        { chargePointId, sessionId: session.id, finalCostPence, durationMinutes },
        'Session completed',
      )

      // Notify the web platform (best-effort) to trigger rewards/payouts/notifications
      void notifyPlatformSessionComplete(session.id, session.booking_id, meterStop, finalCostPence)
    }
  } catch (err) {
    logger.error({ chargePointId, transactionId, err }, 'Error processing StopTransaction')
  }

  // Always respond
  ws.send(
    JSON.stringify([
      OcppMessageType.CallResult,
      uniqueId,
      { idTagInfo: { status: 'Accepted' } },
    ]),
  )
}

/**
 * Pings the web platform to trigger post-session processing
 * (rewards, payouts, notifications). Best-effort.
 */
async function notifyPlatformSessionComplete(
  sessionId: string,
  bookingId: string,
  energyWh: number,
  totalCostPence: number,
): Promise<void> {
  const webApiUrl = process.env['WEB_API_URL']
  const secret = process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'
  if (!webApiUrl) return

  try {
    await fetch(`${webApiUrl}/api/v1/webhooks/ocpp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({
        event: 'session.completed',
        sessionId,
        bookingId,
        energyWh,
        totalCostPence,
      }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    // Swallow — the DB state is already correct; rewards/payouts will reconcile
  }
}
