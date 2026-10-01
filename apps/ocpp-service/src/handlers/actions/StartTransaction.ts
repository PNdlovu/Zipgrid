/**
 * @file StartTransaction.ts
 * @description OCPP 1.6J StartTransaction handler.
 * Called by the charger when a transaction physically starts (cable plugged in,
 * RFID/idTag authorised, relay closed).
 *
 * Flow:
 * 1. Look up the session by idTag + chargePointId (created by platform on RemoteStart)
 * 2. Update session status to 'charging', store transactionId + meterStart
 * 3. Respond with transactionId and idTagInfo.status = 'Accepted'
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

/**
 * OCPP transaction IDs are integers. The platform generates them sequentially.
 * We use the current epoch in seconds as a seed to guarantee uniqueness across restarts.
 */
let _txCounter = Math.floor(Date.now() / 1000)

function nextTransactionId(): number {
  return ++_txCounter
}

export async function handleStartTransaction(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const idTag = payload['idTag'] as string
  const meterStart = Number(payload['meterStart'] ?? 0)   // Wh
  const connectorId = Number(payload['connectorId'] ?? 1)
  const timestamp = payload['timestamp']
    ? new Date(payload['timestamp'] as string)
    : new Date()

  logger.info({ chargePointId, idTag, connectorId, meterStart }, 'StartTransaction')

  const ocppTransactionId = nextTransactionId()

  try {
    const db = await getDb()

    // Find the pending session for this charger + idTag
    const sessionRes = await db.execute(
      `SELECT id FROM charging_sessions
       WHERE charge_point_id = $1
         AND ocpp_id_tag = $2
         AND status = 'preparing'
       ORDER BY created_at DESC LIMIT 1`,
      [chargePointId, idTag],
    )

    if (sessionRes.rows.length > 0) {
      const sessionId = (sessionRes.rows[0] as { id: string }).id

      await db.execute(
        `UPDATE charging_sessions
         SET status = 'charging',
             ocpp_transaction_id = $2,
             started_at = $3,
             energy_consumed_wh = $4,
             connector_id = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId, ocppTransactionId, timestamp.toISOString(), meterStart, connectorId],
      )

      logger.info({ chargePointId, sessionId, ocppTransactionId }, 'Session moved to charging')
    } else {
      // Unknown session — still assign a transactionId so the charger can function
      // Log for investigation
      logger.warn(
        { chargePointId, idTag, connectorId },
        'StartTransaction received for unknown session — accepting anyway',
      )
    }
  } catch (err) {
    logger.error({ chargePointId, idTag, err }, 'Error processing StartTransaction')
  }

  // Always respond Accepted — do not block the physical charging session
  ws.send(
    JSON.stringify([
      OcppMessageType.CallResult,
      uniqueId,
      {
        transactionId: ocppTransactionId,
        idTagInfo: { status: 'Accepted' },
      },
    ]),
  )
}
