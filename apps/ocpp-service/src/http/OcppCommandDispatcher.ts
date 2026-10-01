/**
 * @file OcppCommandDispatcher.ts
 * @description Sends OCPP 1.6J Call messages to connected charge points
 * and awaits their CallResult or CallError response.
 *
 * Uses a pending-request map keyed by uniqueId.
 * Timeout: 30 seconds per command (matches OCPP spec recommendation).
 *
 * @module apps/ocpp-service/http
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { randomUUID } from 'crypto'
import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppMessageType } from '@zipgrid/types'
import { logger } from '../lib/logger'

const COMMAND_TIMEOUT_MS = 30_000

type CommandResult = { status: 'Accepted' | 'Rejected' }
type PendingRequest = {
  resolve: (result: CommandResult) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Singleton pending-request registry — shared across all dispatcher instances.
 * Keyed by OCPP uniqueId.
 */
export const pendingRequests = new Map<string, PendingRequest>()

/**
 * Sends an OCPP Call to a charge point and waits for a CallResult.
 */
export class OcppCommandDispatcher {
  constructor(private readonly connectionManager: ConnectionManager) {}

  /**
   * Sends a command to a connected charge point.
   * @throws if the charger is not connected or times out
   */
  private async sendCommand(
    chargePointId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<CommandResult> {
    const ws = this.connectionManager.get(chargePointId)
    if (!ws) {
      throw new Error(`Charger ${chargePointId} is not connected`)
    }

    const uniqueId = randomUUID()
    const message = JSON.stringify([OcppMessageType.Call, uniqueId, action, payload])

    return new Promise<CommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(uniqueId)
        reject(new Error(`OCPP command ${action} timed out after ${COMMAND_TIMEOUT_MS}ms`))
      }, COMMAND_TIMEOUT_MS)

      pendingRequests.set(uniqueId, { resolve, reject, timer })

      ws.send(message, (err) => {
        if (err) {
          clearTimeout(timer)
          pendingRequests.delete(uniqueId)
          reject(new Error(`Failed to send OCPP message: ${err.message}`))
        }
      })
    })
  }

  /**
   * Resolves a pending request when a CallResult arrives.
   * Called by MessageRouter on OcppMessageType.CallResult.
   */
  static resolveCallResult(uniqueId: string, payload: Record<string, unknown>): void {
    const pending = pendingRequests.get(uniqueId)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRequests.delete(uniqueId)
    const status = (payload['status'] as string) === 'Accepted' ? 'Accepted' : 'Rejected'
    pending.resolve({ status })
  }

  /**
   * Rejects a pending request when a CallError arrives.
   * Called by MessageRouter on OcppMessageType.CallError.
   */
  static rejectCallError(uniqueId: string, errorCode: string, description: string): void {
    const pending = pendingRequests.get(uniqueId)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRequests.delete(uniqueId)
    pending.reject(new Error(`OCPP CallError: ${errorCode} — ${description}`))
  }

  // ── OCPP 1.6J Commands ────────────────────────────────────

  async remoteStart(
    chargePointId: string,
    connectorId: number,
    idTag: string,
  ): Promise<CommandResult> {
    logger.info({ chargePointId, connectorId, idTag }, 'Sending RemoteStartTransaction')
    return this.sendCommand(chargePointId, 'RemoteStartTransaction', { connectorId, idTag })
  }

  async remoteStop(
    chargePointId: string,
    transactionId: number,
  ): Promise<CommandResult> {
    logger.info({ chargePointId, transactionId }, 'Sending RemoteStopTransaction')
    return this.sendCommand(chargePointId, 'RemoteStopTransaction', { transactionId })
  }

  async changeAvailability(
    chargePointId: string,
    connectorId: number,
    type: 'Operative' | 'Inoperative',
  ): Promise<CommandResult> {
    logger.info({ chargePointId, connectorId, type }, 'Sending ChangeAvailability')
    return this.sendCommand(chargePointId, 'ChangeAvailability', { connectorId, type })
  }

  async setChargingProfile(
    chargePointId: string,
    connectorId: number,
    chargingSchedule: Array<{ startPeriod: number; limitAmps: number }>,
  ): Promise<CommandResult> {
    logger.info({ chargePointId, connectorId }, 'Sending SetChargingProfile')
    return this.sendCommand(chargePointId, 'SetChargingProfile', {
      connectorId,
      csChargingProfiles: {
        chargingProfileId: 1,
        stackLevel: 0,
        chargingProfilePurpose: 'TxDefaultProfile',
        chargingProfileKind: 'Relative',
        chargingSchedule: {
          chargingRateUnit: 'A',
          chargingSchedulePeriod: chargingSchedule.map(({ startPeriod, limitAmps }) => ({
            startPeriod,
            limit: limitAmps,
          })),
        },
      },
    })
  }

  async clearChargingProfile(chargePointId: string): Promise<CommandResult> {
    logger.info({ chargePointId }, 'Sending ClearChargingProfile')
    return this.sendCommand(chargePointId, 'ClearChargingProfile', {})
  }
}
