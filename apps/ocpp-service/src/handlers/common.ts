/**
 * @file common.ts
 * @description Shared helpers for OCPP action handlers.
 * @module apps/ocpp-service/handlers
 */

import type { WebSocket } from 'ws'
import { OcppMessageType } from '@zipgrid/types'
import { getDb } from './db'
import { logger } from '../lib/logger'

/** Sends a CallResult for the given request. */
export function reply(ws: WebSocket, uniqueId: string, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify([OcppMessageType.CallResult, uniqueId, payload]))
}

/** Appends to ocpp_event_log. Never throws. */
export async function logOcppEvent(input: {
  chargePointId: string
  eventType: string
  payload: Record<string, unknown>
  connectorId?: number | null
  transactionId?: number | null
  errorCode?: string | null
  timestamp?: Date
}): Promise<void> {
  try {
    const db = await getDb()
    await db.execute(
      `INSERT INTO ocpp_event_log
         (charge_point_id, event_type, payload, connector_id, transaction_id, error_code, timestamp)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
      [
        input.chargePointId,
        input.eventType,
        JSON.stringify(input.payload),
        input.connectorId ?? null,
        input.transactionId ?? null,
        input.errorCode ?? null,
        (input.timestamp ?? new Date()).toISOString(),
      ],
    )
  } catch (err) {
    logger.warn({ chargePointId: input.chargePointId, err }, 'Failed to write ocpp_event_log')
  }
}

/** Parses an OCPP timestamp, falling back to now for missing/invalid values. */
export function parseTimestamp(value: unknown): Date {
  if (typeof value === 'string') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}
