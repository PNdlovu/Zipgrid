/**
 * @file ChargerEventEmitter.ts
 * @description Outbound event publisher for the OCPP service.
 * Publishes charger state-change events to the platform web API so that
 * the Next.js app can react (notify hosts, update DB status, trigger alerts).
 *
 * Events published:
 *   charger.connected       — new WebSocket connection established
 *   charger.disconnected    — WebSocket closed
 *   charger.faulted         — StatusNotification with Faulted status
 *   charger.available       — StatusNotification returning to Available
 *   session.started         — StartTransaction confirmed
 *   session.completed       — StopTransaction received
 *   session.meter_update    — MeterValues received (rate-limited: max 1/5s)
 *
 * Transport: HTTP POST to PLATFORM_API_URL/api/webhooks/ocpp
 * Authenticated with OCPP_SERVICE_SECRET header.
 * Fire-and-forget: failures are logged but never throw.
 *
 * @module apps/ocpp-service/events
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { logger } from '../lib/logger'

/* ── Event types ────────────────────────────────────────────── */

export type ChargerEvent =
  | { type: 'charger.connected';    chargePointId: string; timestamp: string }
  | { type: 'charger.disconnected'; chargePointId: string; timestamp: string }
  | { type: 'charger.faulted';      chargePointId: string; connectorId: number; errorCode: string; timestamp: string }
  | { type: 'charger.available';    chargePointId: string; connectorId: number; timestamp: string }
  | { type: 'session.started';      chargePointId: string; sessionId: string; ocppTransactionId: number; idTag: string; timestamp: string }
  | { type: 'session.completed';    chargePointId: string; ocppTransactionId: number; meterStopWh: number; reason: string; timestamp: string }
  | { type: 'session.meter_update'; chargePointId: string; ocppTransactionId: number; energyWh: number; powerW: number | null; socPercent: number | null; timestamp: string }

/* ── Rate limiter for meter updates (1 per charger per 5s) ─── */

const _meterLastSent = new Map<string, number>()
const METER_MIN_INTERVAL_MS = 5_000

function shouldSendMeterUpdate(chargePointId: string): boolean {
  const last = _meterLastSent.get(chargePointId) ?? 0
  const now = Date.now()
  if (now - last < METER_MIN_INTERVAL_MS) return false
  _meterLastSent.set(chargePointId, now)
  return true
}

/* ── Publisher ──────────────────────────────────────────────── */

function getPlatformApiUrl(): string | null {
  return process.env['PLATFORM_API_URL'] ?? null
}

function getSecret(): string {
  return process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'
}

/**
 * Publishes a charger event to the platform API.
 * Always fire-and-forget — never throws.
 */
async function publish(event: ChargerEvent): Promise<void> {
  const apiUrl = getPlatformApiUrl()
  if (!apiUrl) {
    // In dev without PLATFORM_API_URL, just log
    logger.debug({ event }, 'ChargerEvent (no PLATFORM_API_URL — not sent)')
    return
  }

  try {
    const res = await fetch(`${apiUrl}/api/webhooks/ocpp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSecret()}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) {
      logger.warn({ event: event.type, status: res.status }, 'ChargerEvent publish non-200')
    }
  } catch (err) {
    logger.error({ event: event.type, err }, 'ChargerEvent publish failed')
  }
}

/**
 * Singleton ChargerEventEmitter — all OCPP handlers call these methods.
 */
export const ChargerEventEmitter = {
  /** Called by ConnectionManager when a charger connects */
  onConnected(chargePointId: string): void {
    void publish({ type: 'charger.connected', chargePointId, timestamp: new Date().toISOString() })
  },

  /** Called by ConnectionManager ws.on('close') */
  onDisconnected(chargePointId: string): void {
    void publish({ type: 'charger.disconnected', chargePointId, timestamp: new Date().toISOString() })
  },

  /** Called by StatusNotification handler when status is Faulted */
  onFaulted(chargePointId: string, connectorId: number, errorCode: string): void {
    void publish({
      type: 'charger.faulted',
      chargePointId,
      connectorId,
      errorCode,
      timestamp: new Date().toISOString(),
    })
  },

  /** Called by StatusNotification handler when status returns to Available */
  onAvailable(chargePointId: string, connectorId: number): void {
    void publish({
      type: 'charger.available',
      chargePointId,
      connectorId,
      timestamp: new Date().toISOString(),
    })
  },

  /** Called by StartTransaction handler */
  onSessionStarted(
    chargePointId: string,
    sessionId: string,
    ocppTransactionId: number,
    idTag: string,
  ): void {
    void publish({
      type: 'session.started',
      chargePointId,
      sessionId,
      ocppTransactionId,
      idTag,
      timestamp: new Date().toISOString(),
    })
  },

  /** Called by StopTransaction handler */
  onSessionCompleted(
    chargePointId: string,
    ocppTransactionId: number,
    meterStopWh: number,
    reason: string,
  ): void {
    void publish({
      type: 'session.completed',
      chargePointId,
      ocppTransactionId,
      meterStopWh,
      reason,
      timestamp: new Date().toISOString(),
    })
  },

  /** Called by MeterValues handler — rate-limited to 1 per charger per 5s */
  onMeterUpdate(
    chargePointId: string,
    ocppTransactionId: number,
    energyWh: number,
    powerW: number | null,
    socPercent: number | null,
  ): void {
    if (!shouldSendMeterUpdate(chargePointId)) return
    void publish({
      type: 'session.meter_update',
      chargePointId,
      ocppTransactionId,
      energyWh,
      powerW,
      socPercent,
      timestamp: new Date().toISOString(),
    })
  },
}
