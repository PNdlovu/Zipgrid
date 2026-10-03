/**
 * @file StatusNotification.ts
 * @description OCPP 1.6J StatusNotification handler — charger/connector status.
 * Connector 0 is the charger as a whole. SuspendedEV/SuspendedEVSE pause the
 * live session; Charging resumes it. Faults are reported to the platform.
 *
 * @module apps/ocpp-service/handlers/actions
 */

import type { WebSocket } from 'ws'
import { getDb } from '../db'
import { logOcppEvent, parseTimestamp, reply } from '../common'
import { logger } from '../../lib/logger'
import { notifyPlatform } from '../../lib/platform'

export async function handleStatusNotification(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const status = String(payload['status'] ?? 'Unknown')
  const errorCode = (payload['errorCode'] as string | undefined) ?? 'NoError'
  const connectorId = Number(payload['connectorId'] ?? 0)
  const timestamp = parseTimestamp(payload['timestamp'])

  try {
    const db = await getDb()
    await logOcppEvent({
      chargePointId,
      eventType: 'StatusNotification',
      payload: { status, errorCode, info: payload['info'] ?? null },
      connectorId,
      errorCode: errorCode === 'NoError' ? null : errorCode,
      timestamp,
    })

    if (connectorId === 0) {
      await db.execute(
        `UPDATE charger_devices
         SET current_status = $2, error_code = $3, vendor_error_code = $4, updated_at = NOW()
         WHERE charge_point_id = $1`,
        [chargePointId, status, errorCode, (payload['vendorErrorCode'] as string | undefined) ?? null],
      )
    } else {
      await db.execute(
        `INSERT INTO charger_connectors (charge_point_id, connector_id, status, error_code, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (charge_point_id, connector_id) DO UPDATE
           SET status = EXCLUDED.status, error_code = EXCLUDED.error_code, updated_at = NOW()`,
        [chargePointId, connectorId, status, errorCode],
      )

      if (status === 'SuspendedEV' || status === 'SuspendedEVSE') {
        await db.execute(
          `UPDATE charging_sessions SET status = 'paused', updated_at = NOW()
           WHERE charge_point_id = $1 AND connector_id = $2 AND status = 'charging'`,
          [chargePointId, connectorId],
        )
      } else if (status === 'Charging') {
        await db.execute(
          `UPDATE charging_sessions SET status = 'charging', updated_at = NOW()
           WHERE charge_point_id = $1 AND connector_id = $2 AND status = 'paused'`,
          [chargePointId, connectorId],
        )
      }
    }
  } catch (err) {
    logger.warn({ chargePointId, err }, 'Failed to persist StatusNotification')
  }

  reply(ws, uniqueId, {})

  if (status === 'Faulted' && errorCode !== 'NoError') {
    void notifyPlatform({ event: 'charger.faulted', chargePointId, connectorId, errorCode })
  }
}
