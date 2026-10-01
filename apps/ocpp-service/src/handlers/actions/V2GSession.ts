/**
 * @file V2GSession.ts
 * @description Vehicle-to-Grid (V2G) session handler.
 * V2G allows the EV battery to discharge back to the grid or home.
 * This handler extends OCPP to support bidirectional power flow.
 *
 * OCPP 1.6J does not natively support V2G — we use DataTransfer messages
 * with vendorId 'com.zipgrid.v2g' for bidirectional energy flow signalling
 * until OCPP 2.0.1 (which has native ISO 15118 / V2G support) is implemented.
 *
 * V2G session flow:
 *   1. EV connects and sends V2G capability via DataTransfer
 *   2. Platform evaluates grid demand and tariff signals
 *   3. Platform sends V2G discharge command via DataTransfer
 *   4. EV discharges at requested power; MeterValues report negative power
 *   5. Discharge stops when grid demand met or EV reaches min SoC
 *
 * @module apps/ocpp-service/handlers/actions
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import { OcppMessageType } from '@zipgrid/types'
import { logger } from '../../lib/logger'

const ZIPGRID_V2G_VENDOR_ID = 'com.zipgrid.v2g'

export type V2GCapability = {
  maxDischargePowerKw: number
  minSocPct: number           // minimum battery level before stopping discharge
  supportedModes: string[]    // e.g. ['v2g', 'v2h'] (vehicle-to-grid, vehicle-to-home)
}

export type V2GDischargeCommand = {
  requestedPowerKw: number    // negative value = discharge from EV to grid
  targetDurationMinutes: number
  minSocPct: number
  reason: 'grid_demand' | 'peak_shaving' | 'home_battery' | 'driver_request'
}

/**
 * Handles incoming V2G capability announcement from an EV.
 * Called when DataTransfer with vendorId 'com.zipgrid.v2g' and
 * messageId 'V2GCapabilityAnnouncement' is received.
 */
export async function handleV2GCapability(
  chargePointId: string,
  uniqueId: string,
  capability: V2GCapability,
  ws: WebSocket,
): Promise<void> {
  logger.info({ chargePointId, capability }, 'V2G capability announced')

  // Acknowledge the capability
  ws.send(JSON.stringify([
    OcppMessageType.CallResult,
    uniqueId,
    { status: 'Accepted', message: 'V2G capability registered' },
  ]))

  // In production: store capability in DB and notify platform
  // For now: log for audit
  logger.info(
    { chargePointId, maxDischargePowerKw: capability.maxDischargePowerKw, supportedModes: capability.supportedModes },
    'V2G capable EV registered',
  )
}

/**
 * Sends a V2G discharge command to a charge point.
 * Uses OCPP DataTransfer with Zipgrid vendor extension.
 */
export async function sendV2GDischargeCommand(
  ws: WebSocket,
  chargePointId: string,
  command: V2GDischargeCommand,
  timeoutMs = 15_000,
): Promise<{ accepted: boolean; status: string }> {
  return new Promise((resolve, reject) => {
    const uniqueId = `v2g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const timeout = setTimeout(() => {
      ws.removeListener('message', onMessage)
      reject(new Error(`V2G discharge command timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    function onMessage(data: Buffer | string) {
      try {
        const msg = JSON.parse(data.toString()) as unknown[]
        const [type, msgId, payload] = msg as [number, string, Record<string, unknown>]
        if (type !== OcppMessageType.CallResult || msgId !== uniqueId) return

        clearTimeout(timeout)
        ws.removeListener('message', onMessage)

        const status = String(payload['status'] ?? 'Rejected')
        resolve({ accepted: status === 'Accepted', status })
      } catch { /* ignore */ }
    }

    ws.on('message', onMessage)

    ws.send(JSON.stringify([
      OcppMessageType.Call,
      uniqueId,
      'DataTransfer',
      {
        vendorId:  ZIPGRID_V2G_VENDOR_ID,
        messageId: 'V2GDischargeCommand',
        data:      JSON.stringify(command),
      },
    ]))

    logger.info({ chargePointId, command }, 'V2G discharge command sent')
  })
}

/**
 * Cancels an active V2G discharge session.
 */
export async function cancelV2GDischarge(
  ws: WebSocket,
  chargePointId: string,
): Promise<void> {
  const uniqueId = `v2g-cancel-${Date.now()}`
  ws.send(JSON.stringify([
    OcppMessageType.Call,
    uniqueId,
    'DataTransfer',
    {
      vendorId:  ZIPGRID_V2G_VENDOR_ID,
      messageId: 'V2GDischargeCancel',
      data:      JSON.stringify({ reason: 'platform_cancel' }),
    },
  ]))
  logger.info({ chargePointId }, 'V2G discharge cancelled')
}
