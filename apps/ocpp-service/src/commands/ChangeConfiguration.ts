/**
 * @file ChangeConfiguration.ts
 * @description OCPP 1.6J ChangeConfiguration command builder.
 * Sends a configuration key/value pair to a charge point.
 * Used during device pairing to push Zipgrid-specific settings:
 *   - HeartbeatInterval
 *   - MeterValueSampleInterval
 *   - StopTransactionOnEVSideDisconnect
 *   - LocalAuthorizeOffline
 *
 * @module apps/ocpp-service/commands
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import { OcppMessageType } from '@zipgrid/types'

export type ChangeConfigurationResult = {
  status: 'Accepted' | 'Rejected' | 'RebootRequired' | 'NotSupported'
}

/**
 * Sends a ChangeConfiguration OCPP command to a charge point.
 * Returns a promise that resolves when the charge point acknowledges.
 *
 * @param ws          Active WebSocket connection to the charge point
 * @param key         OCPP configuration key (e.g. 'HeartbeatInterval')
 * @param value       String value (OCPP requires all config values as strings)
 * @param timeoutMs   Maximum time to wait for CallResult (default 10s)
 */
export async function changeConfiguration(
  ws: WebSocket,
  key: string,
  value: string,
  timeoutMs = 10_000,
): Promise<ChangeConfigurationResult> {
  return new Promise((resolve, reject) => {
    const uniqueId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const timeout = setTimeout(() => {
      ws.removeListener('message', onMessage)
      reject(new Error(`ChangeConfiguration timeout for key "${key}" after ${timeoutMs}ms`))
    }, timeoutMs)

    function onMessage(data: Buffer | string) {
      try {
        const msg = JSON.parse(data.toString()) as unknown[]
        const [type, msgId, payload] = msg as [number, string, Record<string, unknown>]
        if (type !== OcppMessageType.CallResult || msgId !== uniqueId) return

        clearTimeout(timeout)
        ws.removeListener('message', onMessage)

        const status = (payload['status'] as string | undefined) ?? 'Rejected'
        resolve({ status: status as ChangeConfigurationResult['status'] })
      } catch { /* ignore malformed messages */ }
    }

    ws.on('message', onMessage)

    ws.send(JSON.stringify([
      OcppMessageType.Call,
      uniqueId,
      'ChangeConfiguration',
      { key, value },
    ]))
  })
}

/**
 * Zipgrid default configuration pushed to every charger on first boot.
 * These are the values required for correct platform operation.
 */
export const ZIPGRID_DEFAULT_CONFIG: Array<{ key: string; value: string }> = [
  { key: 'HeartbeatInterval',                   value: '60' },      // 60s heartbeat
  { key: 'MeterValueSampleInterval',             value: '30' },      // 30s meter values
  { key: 'StopTransactionOnEVSideDisconnect',    value: 'true' },    // auto-stop on unplug
  { key: 'LocalAuthorizeOffline',                value: 'false' },   // require central auth
  { key: 'AllowOfflineTxForUnknownId',           value: 'false' },   // no unauthorised sessions
  { key: 'ConnectionTimeOut',                    value: '60' },      // 60s idle connection timeout
  { key: 'AuthorizationCacheEnabled',            value: 'false' },   // always validate with platform
]

/**
 * Pushes all Zipgrid default configuration keys to a newly paired charger.
 * Best-effort — logs failures but does not throw if individual keys are rejected.
 *
 * @param ws             WebSocket connection to the charger
 * @param chargePointId  Charge point ID (for logging)
 * @param logger         Optional pino-compatible logger
 */
export async function pushDefaultConfiguration(
  ws: WebSocket,
  chargePointId: string,
  logger?: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void },
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = []
  const skipped: string[] = []

  for (const { key, value } of ZIPGRID_DEFAULT_CONFIG) {
    try {
      const result = await changeConfiguration(ws, key, value)
      if (result.status === 'Accepted') {
        applied.push(key)
        logger?.info({ chargePointId, key, value }, `ChangeConfiguration accepted`)
      } else {
        skipped.push(key)
        logger?.warn({ chargePointId, key, value, status: result.status }, `ChangeConfiguration ${result.status}`)
      }
    } catch (err) {
      skipped.push(key)
      logger?.warn({ chargePointId, key, err }, `ChangeConfiguration failed`)
    }
  }

  return { applied, skipped }
}
