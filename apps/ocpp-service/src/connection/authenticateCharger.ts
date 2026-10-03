/**
 * @file authenticateCharger.ts
 * @description Authenticates a charge point's WebSocket upgrade request.
 *
 * OCPP 1.6 Security Profile 1 (Basic auth over TLS — TLS terminated by the
 * Railway edge): the charger sends `Authorization: Basic base64(id:key)` where
 * `id` is its chargePointId and `key` is the pairing key issued by
 * POST /api/v1/chargers/pair. Only the key's SHA-256 is stored.
 *
 * Accepted URL forms:  /ocpp/1.6/<chargePointId>   (issued at pairing)
 *                      /ocpp/<chargePointId>        (legacy)
 *
 * @module apps/ocpp-service/connection
 */

import type { IncomingMessage } from 'http'
import { getDb } from '../handlers/db'
import { safeEqual, sha256Hex } from '../lib/config'

const CHARGE_POINT_ID = /^[A-Za-z0-9_-]{3,100}$/

/** Extracts the chargePointId from the request path, or null if malformed. */
export function parseChargePointId(url: string | undefined): string | null {
  const path = (url ?? '').split('?')[0] ?? ''
  const match = /^\/ocpp\/(?:1\.6\/)?([^/]+)$/.exec(path)
  if (!match?.[1]) return null
  const id = decodeURIComponent(match[1])
  return CHARGE_POINT_ID.test(id) ? id : null
}

/** Returns the authenticated chargePointId, or null when auth fails. */
export async function authenticateCharger(req: IncomingMessage): Promise<string | null> {
  const chargePointId = parseChargePointId(req.url)
  if (!chargePointId) return null

  const header = req.headers['authorization'] ?? ''
  if (!header.startsWith('Basic ')) return null
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const sep = decoded.indexOf(':')
  if (sep < 0) return null
  const username = decoded.slice(0, sep)
  const key = decoded.slice(sep + 1)
  if (username !== chargePointId || key.length === 0) return null

  const db = await getDb()
  const res = await db.execute(
    `SELECT api_key_hash FROM charger_devices WHERE charge_point_id = $1 LIMIT 1`,
    [chargePointId],
  )
  const storedHash = res.rows[0]?.['api_key_hash'] as string | null | undefined
  if (!storedHash) return null

  return safeEqual(sha256Hex(key), storedHash) ? chargePointId : null
}
