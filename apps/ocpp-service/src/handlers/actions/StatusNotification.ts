/**
 * @file StatusNotification.ts
 * @description OCPP 1.6J StatusNotification handler.
 * Receives connector/charger status updates from the charge point.
 * Persists to ocpp_event_log and updates the charger_devices status column.
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
import { randomUUID } from 'crypto'

export async function handleStatusNotification(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const status = payload['status'] as string
  const errorCode = (payload['errorCode'] as string | null) ?? 'NoError'
  const connectorId = Number(payload['connectorId'] ?? 0)
  const timestamp = payload['timestamp']
    ? new Date(payload['timestamp'] as string)
    : new Date()

  logger.info({ chargePointId, connectorId, status, errorCode }, 'StatusNotification')

  try {
    const db = await getDb()

    // Log the status event
    await db.execute(
      `INSERT INTO ocpp_event_log
         (id, charge_point_id, connector_id, action, payload, created_at)
       VALUES ($1, $2, $3, 'StatusNotification', $4::jsonb, $5)`,
      [
        randomUUID(),
        chargePointId,
        connectorId,
        JSON.stringify({ status, errorCode, timestamp: timestamp.toISOString() }),
        timestamp.toISOString(),
      ],
    )

    // Update charger_devices connector status (connector 0 = charger-level)
    if (connectorId === 0) {
      await db.execute(
        `UPDATE charger_devices
         SET current_status = $2, error_code = $3, updated_at = NOW()
         WHERE charge_point_id = $1`,
        [chargePointId, status, errorCode],
      )
    } else {
      // Per-connector status upsert
      await db.execute(
        `INSERT INTO charger_connectors (charge_point_id, connector_id, status, error_code, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (charge_point_id, connector_id) DO UPDATE
           SET status = EXCLUDED.status,
               error_code = EXCLUDED.error_code,
               updated_at = EXCLUDED.updated_at`,
        [chargePointId, connectorId, status, errorCode],
      )
    }

    // If faulted, attempt to notify the platform via the web API
    if (status === 'Faulted' && errorCode !== 'NoError') {
      logger.warn({ chargePointId, connectorId, errorCode }, 'Charger reported Faulted status')
      await notifyFault(chargePointId, connectorId, errorCode)
    }
  } catch (err) {
    logger.warn({ chargePointId, err }, 'Failed to persist StatusNotification')
  }

  // Always respond — charger waits for this
  ws.send(JSON.stringify([OcppMessageType.CallResult, uniqueId, {}]))
}

/**
 * Notifies the platform web API of a charger fault via HTTP.
 * Best-effort — failure does not block the OCPP response.
 */
async function notifyFault(
  chargePointId: string,
  connectorId: number,
  errorCode: string,
): Promise<void> {
  const webApiUrl = process.env['WEB_API_URL']
  const secret = process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'
  if (!webApiUrl) return

  try {
    await fetch(`${webApiUrl}/api/v1/chargers/${encodeURIComponent(chargePointId)}/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({ connectorId, status: 'Faulted', errorCode }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    // Swallow — fault notification is best-effort
  }
}
