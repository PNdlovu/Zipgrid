/**
 * @file ConnectionManager.ts
 * @description Manages active WebSocket connections from OCPP charge points.
 * Maps chargePointId → WebSocket instance for command dispatch.
 * @module apps/ocpp-service/connection
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import { logger } from '../lib/logger'

export class ConnectionManager {
  private readonly connections = new Map<string, WebSocket>()

  /**
   * Registers a new charge point connection.
   */
  register(chargePointId: string, ws: WebSocket): void {
    this.connections.set(chargePointId, ws)
    ws.on('close', () => {
      this.connections.delete(chargePointId)
      logger.info({ chargePointId }, 'Charger disconnected')
    })
  }

  /**
   * Returns the WebSocket for a given charge point ID.
   */
  get(chargePointId: string): WebSocket | undefined {
    return this.connections.get(chargePointId)
  }

  /**
   * Returns the number of currently connected charge points.
   */
  get count(): number {
    return this.connections.size
  }

  /**
   * Returns all connected charge point IDs.
   */
  get ids(): string[] {
    return Array.from(this.connections.keys())
  }
}
