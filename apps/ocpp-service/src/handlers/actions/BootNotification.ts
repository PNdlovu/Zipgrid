/**
 * @file BootNotification.ts
 * @description OCPP 1.6J BootNotification handler.
 *
 * The charger is already authenticated (see authenticateCharger) and therefore
 * registered via pairing. Boot records its identity and marks it online. On the
 * first boot after pairing the Zipgrid default configuration is pushed.
 *
 * @module apps/ocpp-service/handlers/actions
 */

import type { WebSocket } from 'ws'
import { getDb } from '../db'
import { reply } from '../common'
import { logger } from '../../lib/logger'
import { pushDefaultConfiguration } from '../../commands/ChangeConfiguration'

const HEARTBEAT_INTERVAL_SECONDS = 60

export async function handleBootNotification(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const now = new Date()
  let isFirstBoot = false

  try {
    const db = await getDb()
    const prev = await db.execute(
      `SELECT status FROM charger_devices WHERE charge_point_id = $1`,
      [chargePointId],
    )
    isFirstBoot = prev.rows[0]?.['status'] === 'pending'
    await db.execute(
      `UPDATE charger_devices
       SET brand            = COALESCE($2, brand),
           model            = COALESCE($3, model),
           firmware_version = COALESCE($4, firmware_version),
           status           = 'online',
           last_seen_at     = $5,
           last_heartbeat_at = $5,
           heartbeat_interval = $6,
           updated_at       = $5
       WHERE charge_point_id = $1`,
      [
        chargePointId,
        (payload['chargePointVendor'] as string | undefined) ?? null,
        (payload['chargePointModel'] as string | undefined) ?? null,
        (payload['firmwareVersion'] as string | undefined) ?? null,
        now.toISOString(),
        HEARTBEAT_INTERVAL_SECONDS,
      ],
    )
  } catch (err) {
    logger.warn({ chargePointId, err }, 'Failed to update charger on BootNotification')
  }

  reply(ws, uniqueId, {
    currentTime: now.toISOString(),
    interval: HEARTBEAT_INTERVAL_SECONDS,
    status: 'Accepted',
  })

  if (isFirstBoot) {
    // Let the charger process the BootNotification response first.
    setTimeout(() => {
      void pushDefaultConfiguration(ws, chargePointId, logger).then(({ applied, skipped }) => {
        logger.info({ chargePointId, applied, skipped }, 'Default configuration pushed')
      })
    }, 2_000)
  }
}
