/**
 * @file ConnectionManager.ts
 * @description Manages active WebSocket connections from OCPP charge points.
 * Maps chargePointId → WebSocket instance (local) for command dispatch.
 *
 * MULTI-REPLICA SUPPORT
 * ─────────────────────
 * When REDIS_URL is set, the manager publishes connection presence to Redis
 * so that sibling instances (behind a load balancer) know which node holds
 * which charger connection. A charger will only have an active WebSocket on
 * ONE node, but all nodes can query Redis to learn which node owns it.
 *
 * Redis key schema:
 *   ocpp:cp:{chargePointId}  → JSON { nodeId, connectedAt }  (TTL = 90s)
 *   Refreshed on every Heartbeat (every 60s default).
 *
 * Command routing across nodes is NOT yet implemented here (requires a
 * Redis pub/sub fan-out layer or sticky routing at the LB level). This
 * implementation provides presence state and per-node WebSocket maps.
 *
 * @module apps/ocpp-service/connection
 * @version 0.2.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import Redis from 'ioredis'
import { logger } from '../lib/logger'

// Unique identifier for this process / replica instance
const NODE_ID = process.env['NODE_ID'] ?? `ocpp-${Math.random().toString(36).slice(2, 8)}`

// Redis presence TTL: must be > heartbeat interval (default 60s) + margin
const PRESENCE_TTL_SECONDS = 90

export type ConnectionPresence = {
  chargePointId: string
  nodeId: string
  connectedAt: string
  local: boolean
}

export class ConnectionManager {
  /** In-memory WebSocket registry — local to this process */
  private readonly connections = new Map<string, WebSocket>()

  /** Redis client for cross-replica presence (null if REDIS_URL not set) */
  private redis: Redis | null = null

  /** Whether Redis has been successfully initialised */
  private redisReady = false

  constructor() {
    this._initRedis()
  }

  private _initRedis(): void {
    const redisUrl = process.env['REDIS_URL']
    if (!redisUrl) {
      logger.info('ConnectionManager: Redis not configured — running in single-replica mode')
      return
    }

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    })

    this.redis.on('error', (err: Error) => {
      logger.warn({ err }, 'ConnectionManager: Redis error — continuing without presence sync')
    })
    this.redis.on('ready', () => {
      this.redisReady = true
      logger.info({ nodeId: NODE_ID }, 'ConnectionManager: Redis presence sync active')
    })

    void this.redis.connect().catch((err: Error) => {
      logger.warn({ err }, 'ConnectionManager: Redis connect failed — single-replica mode')
    })
  }

  /**
   * Registers a new charge point connection.
   * Publishes presence to Redis (if connected).
   */
  register(chargePointId: string, ws: WebSocket): void {
    // A reconnecting charger replaces its previous (likely half-open) socket.
    const previous = this.connections.get(chargePointId)
    if (previous && previous !== ws) previous.terminate()

    this.connections.set(chargePointId, ws)
    void this._publishPresence(chargePointId)

    ws.on('close', () => {
      // Only drop the entry if it still points at this socket.
      if (this.connections.get(chargePointId) !== ws) return
      this.connections.delete(chargePointId)
      void this._removePresence(chargePointId)
      logger.info({ chargePointId, nodeId: NODE_ID }, 'Charger disconnected')
    })

    logger.info({ chargePointId, nodeId: NODE_ID }, 'Charger connected')
  }

  /**
   * Returns the local WebSocket for a given charge point ID.
   * Only returns a socket if this node holds the connection.
   */
  get(chargePointId: string): WebSocket | undefined {
    return this.connections.get(chargePointId)
  }

  /**
   * Checks Redis to find which node currently holds a charger connection.
   * Returns null if the charger is not connected anywhere.
   */
  async getPresence(chargePointId: string): Promise<ConnectionPresence | null> {
    // Check local first (fast path)
    if (this.connections.has(chargePointId)) {
      return {
        chargePointId,
        nodeId: NODE_ID,
        connectedAt: new Date().toISOString(),
        local: true,
      }
    }

    if (!this.redis || !this.redisReady) return null

    try {
      const raw = await this.redis.get(`ocpp:cp:${chargePointId}`)
      if (!raw) return null
      const data = JSON.parse(raw) as { nodeId: string; connectedAt: string }
      return { chargePointId, ...data, local: false }
    } catch {
      return null
    }
  }

  /**
   * Returns all charge point IDs connected globally (across all nodes).
   * Slow path — scans Redis. Use sparingly (e.g. ops dashboard).
   */
  async getAllConnectedIds(): Promise<string[]> {
    if (!this.redis || !this.redisReady) return this.ids
    try {
      const keys = await this.redis.keys('ocpp:cp:*')
      return keys.map((k: string) => k.replace('ocpp:cp:', ''))
    } catch {
      return this.ids
    }
  }

  /**
   * Refreshes the Redis TTL for a charge point (called on each Heartbeat).
   */
  async refreshPresence(chargePointId: string): Promise<void> {
    if (!this.redis || !this.redisReady) return
    if (!this.connections.has(chargePointId)) return
    try {
      await this.redis.expire(`ocpp:cp:${chargePointId}`, PRESENCE_TTL_SECONDS)
    } catch { /* non-fatal */ }
  }

  /**
   * Returns the number of charge points connected to THIS node.
   */
  get count(): number {
    return this.connections.size
  }

  /**
   * Returns all charge point IDs connected to THIS node.
   */
  get ids(): string[] {
    return Array.from(this.connections.keys())
  }

  /**
   * Returns the nodeId of this replica.
   */
  get nodeId(): string {
    return NODE_ID
  }

  // ── Private Redis helpers ────────────────────────────────────

  private async _publishPresence(chargePointId: string): Promise<void> {
    if (!this.redis || !this.redisReady) return
    try {
      await this.redis.setex(
        `ocpp:cp:${chargePointId}`,
        PRESENCE_TTL_SECONDS,
        JSON.stringify({ nodeId: NODE_ID, connectedAt: new Date().toISOString() }),
      )
    } catch { /* non-fatal */ }
  }

  private async _removePresence(chargePointId: string): Promise<void> {
    if (!this.redis || !this.redisReady) return
    try {
      const raw = await this.redis.get(`ocpp:cp:${chargePointId}`)
      if (raw) {
        const data = JSON.parse(raw) as { nodeId: string }
        if (data.nodeId === NODE_ID) {
          await this.redis.del(`ocpp:cp:${chargePointId}`)
        }
      }
    } catch { /* non-fatal */ }
  }

  /** Graceful shutdown — close Redis connection. */
  async shutdown(): Promise<void> {
    if (this.redis && this.redisReady) {
      await Promise.all(this.ids.map((id) => this._removePresence(id)))
      this.redis.disconnect()
    }
  }
}
