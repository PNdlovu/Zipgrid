/**
 * @file RemoteStartTransaction.ts
 * @description OCPP 1.6J RemoteStartTransaction command dispatcher.
 * Sends a server-initiated start request to a connected charge point.
 * The charge point responds with Accepted/Rejected; the physical transaction
 * begins when the charger sends back a StartTransaction Call.
 *
 * @module apps/ocpp-service/commands
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppCommandDispatcher } from '../http/OcppCommandDispatcher'
import { logger } from '../lib/logger'

export type RemoteStartParams = {
  chargePointId: string
  connectorId?: number
  idTag: string
}

export type RemoteStartResult = {
  status: 'Accepted' | 'Rejected' | 'Offline'
}

/**
 * Dispatches RemoteStartTransaction to a charge point.
 * Returns Offline immediately if the charger is not currently connected.
 */
export async function sendRemoteStart(
  connectionManager: ConnectionManager,
  params: RemoteStartParams,
): Promise<RemoteStartResult> {
  const { chargePointId, connectorId = 1, idTag } = params

  if (!connectionManager.get(chargePointId)) {
    logger.warn({ chargePointId }, 'RemoteStart: charger offline')
    return { status: 'Offline' }
  }

  const dispatcher = new OcppCommandDispatcher(connectionManager)

  try {
    const result = await dispatcher.remoteStart(chargePointId, connectorId, idTag)
    logger.info({ chargePointId, connectorId, idTag, status: result.status }, 'RemoteStartTransaction sent')
    return result
  } catch (err) {
    logger.error({ chargePointId, err }, 'RemoteStartTransaction failed')
    return { status: 'Rejected' }
  }
}
