/**
 * @file MessageRouter.ts
 * @description Routes incoming OCPP messages to the correct handler.
 * Supports OCPP 1.6J Call/CallResult/CallError message types.
 * @module apps/ocpp-service/handlers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import type { ConnectionManager } from '../connection/ConnectionManager'
import { OcppMessageType } from '@zipgrid/types'
import { logger } from '../lib/logger'

export class MessageRouter {
  constructor(private readonly connectionManager: ConnectionManager) {}

  /**
   * Attaches message handler to a charge point WebSocket.
   */
  attach(chargePointId: string, ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as unknown[]
        const [type] = message

        switch (type) {
          case OcppMessageType.Call:
            this.handleCall(chargePointId, message, ws)
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

  private handleCall(chargePointId: string, message: unknown[], ws: WebSocket): void {
    const [, uniqueId, action] = message as [number, string, string, Record<string, unknown>]
    logger.info({ chargePointId, uniqueId, action }, 'OCPP Call received')
    // Individual action handlers are registered in Phase 1 build
    void ws
  }

  private handleCallResult(chargePointId: string, message: unknown[]): void {
    const [, uniqueId] = message as [number, string, Record<string, unknown>]
    logger.info({ chargePointId, uniqueId }, 'OCPP CallResult received')
  }

  private handleCallError(chargePointId: string, message: unknown[]): void {
    const [, uniqueId, errorCode] = message as [number, string, string, string]
    logger.error({ chargePointId, uniqueId, errorCode }, 'OCPP CallError received')
  }
}
