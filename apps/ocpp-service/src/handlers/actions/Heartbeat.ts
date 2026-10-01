/**
 * @file Heartbeat.ts
 * @description OCPP 1.6J Heartbeat handler.
 * Updates the charger's last-seen timestamp and responds with current time.
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

export async function handleHeartbeat(
  chargePointId: string,
  uniqueId: string,
  _payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const now = new Date()

  // Best-effort update of last_heartbeat timestamp
  try {
    const db = await getDb()
    await db.execute(
      `UPDATE charger_devices
       SET last_heartbeat = $2, updated_at = $2
       WHERE charge_point_id = $1`,
      [chargePointId, now.toISOString()],
    )
  } catch (err) {
    logger.warn({ chargePointId, err }, 'Failed to update heartbeat timestamp')
  }

  logger.debug({ chargePointId }, 'Heartbeat')

  ws.send(
    JSON.stringify([
      OcppMessageType.CallResult,
      uniqueId,
      { currentTime: now.toISOString() },
    ]),
  )
}
