/**
 * @file RemoteStopTransaction.ts
 * @description OCPP 1.6J RemoteStopTransaction command dispatcher.
 * Sends a server-initiated stop request to a connected charge point.
 * The charge point responds with Accepted/Rejected; the physical session
 * ends when the charger sends back a StopTransaction Call.
 *
 * @module apps/ocpp-service/commands
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppCommandDispatcher } from '../http/OcppCommandDispatcher'
import { logger } from '../lib/logger'

export type RemoteStopParams = {
  chargePointId: string
  transactionId: number
}

export type RemoteStopResult = {
  status: 'Accepted' | 'Rejected' | 'Offline'
}

/**
 * Dispatches RemoteStopTransaction to a charge point.
 * Returns Offline immediately if the charger is not currently connected.
 */
export async function sendRemoteStop(
  connectionManager: ConnectionManager,
  params: RemoteStopParams,
): Promise<RemoteStopResult> {
  const { chargePointId, transactionId } = params

  if (!connectionManager.get(chargePointId)) {
    logger.warn({ chargePointId, transactionId }, 'RemoteStop: charger offline')
    return { status: 'Offline' }
  }

  const dispatcher = new OcppCommandDispatcher(connectionManager)

  try {
    const result = await dispatcher.remoteStop(chargePointId, transactionId)
    logger.info({ chargePointId, transactionId, status: result.status }, 'RemoteStopTransaction sent')
    return result
  } catch (err) {
    logger.error({ chargePointId, transactionId, err }, 'RemoteStopTransaction failed')
    return { status: 'Rejected' }
  }
}
