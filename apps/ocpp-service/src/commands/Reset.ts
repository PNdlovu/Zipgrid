/**
 * @file Reset.ts
 * @description OCPP 1.6J Reset command dispatcher.
 * Sends a Soft or Hard reset request to a connected charge point.
 *
 * Soft reset: charger finishes any ongoing transaction first, then reboots.
 * Hard reset: charger reboots immediately, potentially losing live session data.
 *             Use hard reset only as a last resort for stuck/frozen chargers.
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

export type ResetType = 'Soft' | 'Hard'

export type ResetParams = {
  chargePointId: string
  type?: ResetType
}

export type ResetResult = {
  status: 'Accepted' | 'Rejected' | 'Offline'
}

const RESET_TIMEOUT_MS = 30_000

/**
 * Dispatches Reset to a charge point.
 * Defaults to Soft reset (recommended — allows active transaction to complete).
 */
export async function sendReset(
  connectionManager: ConnectionManager,
  params: ResetParams,
): Promise<ResetResult> {
  const { chargePointId, type = 'Soft' } = params

  const ws = connectionManager.get(chargePointId)
  if (!ws) {
    logger.warn({ chargePointId, type }, 'Reset: charger offline')
    return { status: 'Offline' }
  }

  const uniqueId = randomUUID()
  const message = JSON.stringify([OcppMessageType.Call, uniqueId, 'Reset', { type }])

  return new Promise<ResetResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(uniqueId)
      logger.warn({ chargePointId, type }, 'Reset timed out')
      resolve({ status: 'Rejected' })
    }, RESET_TIMEOUT_MS)

    pendingRequests.set(uniqueId, {
      resolve: (result) => {
        clearTimeout(timer)
        logger.info({ chargePointId, type, status: result.status }, 'Reset response received')
        resolve(result)
      },
      reject: (err) => {
        clearTimeout(timer)
        logger.error({ chargePointId, type, err }, 'Reset CallError')
        resolve({ status: 'Rejected' })
      },
      timer,
    })

    ws.send(message, (err) => {
      if (err) {
        clearTimeout(timer)
        pendingRequests.delete(uniqueId)
        logger.error({ chargePointId, err }, 'Failed to send Reset')
        resolve({ status: 'Rejected' })
      } else {
        logger.info({ chargePointId, type, uniqueId }, 'Reset sent')
      }
    })
  })
}
