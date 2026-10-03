/**
 * @file Heartbeat.ts
 * @description OCPP 1.6J Heartbeat handler — records liveness, returns server time.
 * @module apps/ocpp-service/handlers/actions
 */

import type { WebSocket } from 'ws'
import { getDb } from '../db'
import { reply } from '../common'
import { logger } from '../../lib/logger'

export async function handleHeartbeat(
  chargePointId: string,
  uniqueId: string,
  _payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const now = new Date()
  try {
    const db = await getDb()
    await db.execute(
      `UPDATE charger_devices
       SET last_heartbeat_at = $2, last_seen_at = $2, status = 'online', updated_at = $2
       WHERE charge_point_id = $1`,
      [chargePointId, now.toISOString()],
    )
  } catch (err) {
    logger.warn({ chargePointId, err }, 'Failed to update heartbeat timestamp')
  }
  reply(ws, uniqueId, { currentTime: now.toISOString() })
}
