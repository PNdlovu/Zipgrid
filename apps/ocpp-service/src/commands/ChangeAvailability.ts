/**
 * @file ChangeAvailability.ts
 * @description OCPP 1.6J ChangeAvailability command dispatcher.
 * Sets a connector (or whole charger via connectorId=0) to Operative or Inoperative.
 * Used to temporarily take a charger offline without unpairing it from the platform.
 *
 * @module apps/ocpp-service/commands
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppCommandDispatcher } from '../http/OcppCommandDispatcher'
import { logger } from '../lib/logger'

export type ChangeAvailabilityParams = {
  chargePointId: string
  /** 0 = whole charger; > 0 = specific connector */
  connectorId: number
  /** true = Operative (accept sessions); false = Inoperative (block sessions) */
  available: boolean
}

export type ChangeAvailabilityResult = {
  status: 'Accepted' | 'Rejected' | 'Scheduled' | 'Offline'
}

/**
 * Dispatches ChangeAvailability to a charge point.
 * 'Scheduled' means the charger will apply the change at the end of the current session.
 */
export async function sendChangeAvailability(
  connectionManager: ConnectionManager,
  params: ChangeAvailabilityParams,
): Promise<ChangeAvailabilityResult> {
  const { chargePointId, connectorId, available } = params
  const type = available ? 'Operative' : 'Inoperative'

  if (!connectionManager.get(chargePointId)) {
    logger.warn({ chargePointId, connectorId, type }, 'ChangeAvailability: charger offline')
    return { status: 'Offline' }
  }

  const dispatcher = new OcppCommandDispatcher(connectionManager)

  try {
    const result = await dispatcher.changeAvailability(chargePointId, connectorId, type)
    logger.info({ chargePointId, connectorId, type, status: result.status }, 'ChangeAvailability sent')
    return result as ChangeAvailabilityResult
  } catch (err) {
    logger.error({ chargePointId, connectorId, type, err }, 'ChangeAvailability failed')
    return { status: 'Rejected' }
  }
}
