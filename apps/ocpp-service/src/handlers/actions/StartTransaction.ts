/**
 * @file StartTransaction.ts
 * @description OCPP 1.6J StartTransaction handler.
 *
 * The platform creates a `preparing` session with a unique idTag before it
 * sends RemoteStartTransaction. A StartTransaction is only Accepted when it
 * matches such a session on this charger; anything else (unknown RFID card,
 * replayed idTag) is answered Invalid so the charger does not deliver energy.
 *
 * meterStart is recorded so energy = meter_stop_wh − meter_start_wh
 * (energy_consumed_wh is a generated column).
 *
 * @module apps/ocpp-service/handlers/actions
 */

import type { WebSocket } from 'ws'
import { getDb } from '../db'
import { logOcppEvent, parseTimestamp, reply } from '../common'
import { logger } from '../../lib/logger'

export async function handleStartTransaction(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const idTag = String(payload['idTag'] ?? '')
  const meterStart = Math.max(0, Math.round(Number(payload['meterStart'] ?? 0)))
  const connectorId = Number(payload['connectorId'] ?? 1)
  const timestamp = parseTimestamp(payload['timestamp'])

  const db = await getDb()
  // The charger needs a transactionId even when we reject the idTag.
  const seq = await db.execute(`SELECT nextval('ocpp_transaction_id_seq')::INT AS id`)
  const transactionId = Number(seq.rows[0]?.['id'])

  const res = await db.execute(
    `UPDATE charging_sessions
     SET status = 'charging',
         ocpp_transaction_id = $3,
         started_at = $4,
         meter_start_wh = $5,
         meter_stop_wh = $5,
         ocpp_connector_id = $6,
         connector_id = $6,
         authorized_at = COALESCE(authorized_at, $4),
         updated_at = NOW()
     WHERE id = (
       SELECT id FROM charging_sessions
       WHERE charge_point_id = $1 AND ocpp_id_tag = $2 AND status = 'preparing'
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING id`,
    [chargePointId, idTag, transactionId, timestamp.toISOString(), meterStart, connectorId],
  )
  const sessionId = res.rows[0]?.['id'] as string | undefined

  await logOcppEvent({
    chargePointId,
    eventType: 'StartTransaction',
    payload: { idTag, meterStart, connectorId, sessionId: sessionId ?? null },
    connectorId,
    transactionId,
    timestamp,
  })

  if (sessionId) {
    logger.info({ chargePointId, sessionId, transactionId }, 'Session charging')
  } else {
    logger.warn({ chargePointId, idTag, connectorId }, 'StartTransaction for unknown idTag — rejected')
  }

  reply(ws, uniqueId, {
    transactionId,
    idTagInfo: { status: sessionId ? 'Accepted' : 'Invalid' },
  })
}
