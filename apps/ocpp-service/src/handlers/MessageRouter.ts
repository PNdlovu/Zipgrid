/**
 * @file MessageRouter.ts
 * @description Routes incoming OCPP 1.6J messages to the correct action handler.
 * Supports Call (2), CallResult (3), CallError (4) message types.
 *
 * Action handlers implemented:
 *   BootNotification  — charger identity + heartbeat interval
 *   Heartbeat         — keepalive, updates last_heartbeat
 *   StatusNotification — connector status updates
 *   StartTransaction  — session activation on physical start
 *   StopTransaction   — session finalisation on physical stop
 *   MeterValues       — live energy/power/SoC updates
 *
 * @module apps/ocpp-service/handlers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppMessageType } from '@zipgrid/types'
import { logger } from '../lib/logger'
import { OcppCommandDispatcher } from '../http/OcppCommandDispatcher'
import { handleBootNotification } from './actions/BootNotification'
import { handleHeartbeat } from './actions/Heartbeat'
import { handleStatusNotification } from './actions/StatusNotification'
import { handleStartTransaction } from './actions/StartTransaction'
import { handleStopTransaction } from './actions/StopTransaction'
import { handleMeterValues } from './actions/MeterValues'
import { getDb } from './db'

export class MessageRouter {
  constructor(private readonly connectionManager: ConnectionManager) {}

  /**
   * Attaches message handler to a charge point WebSocket.
   */
  attach(chargePointId: string, ws: WebSocket): void {
    ws.on('message', (data) => {
      const raw = data.toString()
      try {
        const message = JSON.parse(raw) as unknown[]
        const [type] = message

        switch (type) {
          case OcppMessageType.Call:
            void this.handleCall(chargePointId, message, ws)
            break
          case OcppMessageType.CallResult:
            this.handleCallResult(chargePointId, message)
            break
          case OcppMessageType.CallError:
            this.handleCallError(chargePointId, message)
            break
          default:
            logger.warn({ chargePointId, type }, 'Unknown OCPP message type')
        }
      } catch (err) {
        logger.error({ chargePointId, err }, 'Failed to parse OCPP message')
      }
    })
  }

  private async handleCall(
    chargePointId: string,
    message: unknown[],
    ws: WebSocket,
  ): Promise<void> {
    const [, uniqueId, action, payload] = message as [
      number,
      string,
      string,
      Record<string, unknown>,
    ]

    logger.info({ chargePointId, action, uniqueId }, 'OCPP Call')

    try {
      switch (action) {
        case 'BootNotification':
          await handleBootNotification(chargePointId, uniqueId, payload, ws)
          break

        case 'Heartbeat':
          await handleHeartbeat(chargePointId, uniqueId, payload, ws)
          break

        case 'StatusNotification':
          await handleStatusNotification(chargePointId, uniqueId, payload, ws)
          break

        case 'StartTransaction':
          await handleStartTransaction(chargePointId, uniqueId, payload, ws)
          break

        case 'StopTransaction':
          await handleStopTransaction(chargePointId, uniqueId, payload, ws)
          break

        case 'MeterValues':
          await handleMeterValues(chargePointId, uniqueId, payload, ws)
          break

        case 'Authorize': {
          // Only idTags issued for a pending session on this charger are valid.
          const idTag = String(payload['idTag'] ?? '')
          const db = await getDb()
          const res = await db.execute(
            `SELECT 1 FROM charging_sessions
             WHERE charge_point_id = $1 AND ocpp_id_tag = $2 AND status = 'preparing' LIMIT 1`,
            [chargePointId, idTag],
          )
          ws.send(
            JSON.stringify([
              OcppMessageType.CallResult,
              uniqueId,
              { idTagInfo: { status: res.rows.length > 0 ? 'Accepted' : 'Invalid' } },
            ]),
          )
          break
        }

        case 'DataTransfer': {
          // Acknowledge but do not process vendor-specific data
          ws.send(
            JSON.stringify([
              OcppMessageType.CallResult,
              uniqueId,
              { status: 'Accepted' },
            ]),
          )
          break
        }

        default:
          logger.warn({ chargePointId, action }, 'Unhandled OCPP action — sending NotImplemented')
          ws.send(
            JSON.stringify([
              OcppMessageType.CallError,
              uniqueId,
              'NotImplemented',
              `Action ${action} is not supported`,
              {},
            ]),
          )
      }
    } catch (err) {
      logger.error({ chargePointId, action, err }, 'Error handling OCPP Call')
      ws.send(
        JSON.stringify([
          OcppMessageType.CallError,
          uniqueId,
          'InternalError',
          'An internal error occurred',
          {},
        ]),
      )
    }
  }

  private handleCallResult(chargePointId: string, message: unknown[]): void {
    const [, uniqueId, payload] = message as [number, string, Record<string, unknown>]
    logger.info({ chargePointId, uniqueId }, 'OCPP CallResult')
    // Resolve any pending command (e.g. RemoteStart awaiting CallResult)
    OcppCommandDispatcher.resolveCallResult(uniqueId, payload)
  }

  private handleCallError(chargePointId: string, message: unknown[]): void {
    const [, uniqueId, errorCode, description] = message as [
      number,
      string,
      string,
      string,
      Record<string, unknown>,
    ]
    logger.error({ chargePointId, uniqueId, errorCode, description }, 'OCPP CallError')
    OcppCommandDispatcher.rejectCallError(uniqueId, errorCode, description ?? '')
  }
}
