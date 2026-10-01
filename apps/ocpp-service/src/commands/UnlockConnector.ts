/**
 * @file UnlockConnector.ts
 * @description OCPP 1.6J UnlockConnector command dispatcher.
 * Sends an unlock request to free a stuck cable from a connector.
 * Used by support agents when a driver cannot physically disconnect their cable.
 *
 * The charge point responds with:
 *   Unlocked       — cable released successfully
 *   UnlockFailed   — locking mechanism could not release
 *   NotSupported   — this charger does not support cable locking
 *
 * @module apps/ocpp-service/commands
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { randomUUID } from 'crypto'
import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppMessageType } from '@zipgrid/types'
import { pendingRequests } from '../http/OcppCommandDispatcher'
import { logger } from '../lib/logger'

export type UnlockConnectorParams = {
  chargePointId: string
  connectorId: number
}

export type UnlockConnectorResult = {
  status: 'Unlocked' | 'UnlockFailed' | 'NotSupported' | 'Offline'
}

const UNLOCK_TIMEOUT_MS = 30_000

/**
 * Dispatches UnlockConnector to a charge point.
 */
export async function sendUnlockConnector(
  connectionManager: ConnectionManager,
  params: UnlockConnectorParams,
): Promise<UnlockConnectorResult> {
  const { chargePointId, connectorId } = params

  const ws = connectionManager.get(chargePointId)
  if (!ws) {
    logger.warn({ chargePointId, connectorId }, 'UnlockConnector: charger offline')
    return { status: 'Offline' }
  }

  const uniqueId = randomUUID()
  const message = JSON.stringify([OcppMessageType.Call, uniqueId, 'UnlockConnector', { connectorId }])

  return new Promise<UnlockConnectorResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(uniqueId)
      logger.warn({ chargePointId, connectorId }, 'UnlockConnector timed out')
      resolve({ status: 'UnlockFailed' })
    }, UNLOCK_TIMEOUT_MS)

    pendingRequests.set(uniqueId, {
      resolve: (result) => {
        clearTimeout(timer)
        // UnlockConnector returns { status: 'Unlocked' | 'UnlockFailed' | 'NotSupported' }
        // Our generic CommandResult only has Accepted/Rejected — map it
        const raw = result.status === 'Accepted' ? 'Unlocked' : 'UnlockFailed'
        logger.info({ chargePointId, connectorId, status: raw }, 'UnlockConnector response')
        resolve({ status: raw })
      },
      reject: (err) => {
        clearTimeout(timer)
        logger.error({ chargePointId, connectorId, err }, 'UnlockConnector CallError')
        resolve({ status: 'UnlockFailed' })
      },
      timer,
    })

    ws.send(message, (err) => {
      if (err) {
        clearTimeout(timer)
        pendingRequests.delete(uniqueId)
        logger.error({ chargePointId, err }, 'Failed to send UnlockConnector')
        resolve({ status: 'UnlockFailed' })
      } else {
        logger.info({ chargePointId, connectorId, uniqueId }, 'UnlockConnector sent')
      }
    })
  })
}
