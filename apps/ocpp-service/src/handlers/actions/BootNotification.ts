/**
 * @file BootNotification.ts
 * @description OCPP 1.6J BootNotification handler.
 * Called when a charger connects and sends its identity information.
 * Response: Accepted + heartbeat interval.
 *
 * On FIRST boot (new charger_device row), automatically pushes the
 * Zipgrid default configuration via ChangeConfiguration commands.
 * This ensures every newly paired charger reports meter values,
 * uses a 60s heartbeat, and requires central authorisation.
 *
 * @module apps/ocpp-service/handlers/actions
 * @version 0.2.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import { OcppMessageType } from '@zipgrid/types'
import { getDb } from '../db'
import { logger } from '../../lib/logger'
import { pushDefaultConfiguration } from '../../commands/ChangeConfiguration'

const HEARTBEAT_INTERVAL_SECONDS = 60

export async function handleBootNotification(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  logger.info(
    {
      chargePointId,
      vendor:   payload['chargePointVendor'],
      model:    payload['chargePointModel'],
      firmware: payload['firmwareVersion'],
    },
    'BootNotification received',
  )

  const now = new Date()
  let isFirstBoot = false

  // Upsert charger record into charger_devices
  try {
    const db = await getDb()

    // Detect first boot: insert returns a row, update returns 0 rows on xmax=0
    const upsertRes = await db.execute(
      `INSERT INTO charger_devices (
         charge_point_id, vendor, model, serial_number,
         firmware_version, connected_at, last_boot_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
       ON CONFLICT (charge_point_id) DO UPDATE
         SET vendor            = EXCLUDED.vendor,
             model             = EXCLUDED.model,
             serial_number     = EXCLUDED.serial_number,
             firmware_version  = EXCLUDED.firmware_version,
             connected_at      = EXCLUDED.connected_at,
             last_boot_at      = EXCLUDED.last_boot_at,
             updated_at        = EXCLUDED.updated_at
       RETURNING (xmax = 0) AS inserted`,
      [
        chargePointId,
        (payload['chargePointVendor']        as string | null) ?? 'Unknown',
        (payload['chargePointModel']         as string | null) ?? 'Unknown',
        (payload['chargePointSerialNumber']  as string | null) ?? null,
        (payload['firmwareVersion']          as string | null) ?? null,
        now.toISOString(),
      ],
    )

    isFirstBoot = (upsertRes.rows[0] as { inserted: boolean } | undefined)?.inserted ?? false
  } catch (err) {
    logger.warn({ chargePointId, err }, 'Failed to upsert charger device on BootNotification')
  }

  // ── Send Accepted response FIRST (charger expects a prompt reply) ──
  ws.send(JSON.stringify([
    OcppMessageType.CallResult,
    uniqueId,
    {
      currentTime: now.toISOString(),
      interval:    HEARTBEAT_INTERVAL_SECONDS,
      status:      'Accepted',
    },
  ]))

  // ── Push default configuration on first pairing ─────────────────
  // Done async AFTER sending the CallResult so we don't block the handshake.
  // The charger must be in a ready state to accept ChangeConfiguration.
  if (isFirstBoot) {
    // Small delay to let the charger process the BootNotification response
    setTimeout(() => {
      void pushDefaultConfiguration(ws, chargePointId, logger).then(({ applied, skipped }) => {
        logger.info(
          { chargePointId, applied, skipped },
          'Default configuration pushed to newly paired charger',
        )
      })
    }, 2_000)
  }
}
