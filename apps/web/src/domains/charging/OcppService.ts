/**
 * @file OcppService.ts
 * @description OCPP command dispatch service.
 * Sends HTTP commands to the standalone OCPP WebSocket service (Railway).
 * The OCPP service holds the live WebSocket connections; Next.js calls it
 * over a secure internal HTTP API to issue remote commands.
 *
 * @module domains/charging
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { ServiceUnavailableError, AppError } from '@/lib/errors/AppError'
import { requireEnv } from '@/lib/env'

type OcppCommandResult = { status: 'Accepted' | 'Rejected' }

function getOcppServiceUrl(): string {
  const url = process.env['OCPP_SERVICE_URL']
  if (!url) {
    if (process.env.NODE_ENV !== 'production') return 'http://localhost:3001'
    throw new ServiceUnavailableError('OCPP service')
  }
  return url
}

function getOcppServiceSecret(): string {
  return requireEnv('OCPP_SERVICE_SECRET')
}

async function callOcppService(path: string, body: Record<string, unknown>): Promise<OcppCommandResult> {
  const url = `${getOcppServiceUrl()}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOcppServiceSecret()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new AppError(`OCPP service returned ${res.status}`, 'OCPP_ERROR', 502)
  }
  return res.json() as Promise<OcppCommandResult>
}

/**
 * OCPP command dispatch — called by API routes to control chargers remotely.
 */
export const OcppService = {
  /**
   * Sends RemoteStartTransaction to start a charging session.
   * @param chargePointId - OCPP CP identifier
   * @param connectorId - Connector number (usually 1)
   * @param idTag - Platform-generated idTag for this booking
   */
  async remoteStart(chargePointId: string, connectorId: number, idTag: string): Promise<OcppCommandResult> {
    return callOcppService('/ocpp/remote-start', { chargePointId, connectorId, idTag })
  },

  /**
   * Sends RemoteStopTransaction to stop an active session.
   * @param chargePointId - OCPP CP identifier
   * @param transactionId - OCPP transaction ID from StartTransaction
   */
  async remoteStop(chargePointId: string, transactionId: number): Promise<OcppCommandResult> {
    return callOcppService('/ocpp/remote-stop', { chargePointId, transactionId })
  },

  /**
   * Sets a charger to Operative or Inoperative via ChangeAvailability.
   */
  async changeAvailability(
    chargePointId: string,
    connectorId: number,
    available: boolean,
  ): Promise<OcppCommandResult> {
    return callOcppService('/ocpp/change-availability', {
      chargePointId,
      connectorId,
      type: available ? 'Operative' : 'Inoperative',
    })
  },

  /**
   * Pushes a charging schedule via SetChargingProfile.
   * Used by the smart scheduler to enforce tariff-optimal windows.
   */
  async setChargingProfile(
    chargePointId: string,
    connectorId: number,
    schedule: { startPeriod: number; limitAmps: number }[],
  ): Promise<OcppCommandResult> {
    return callOcppService('/ocpp/set-charging-profile', {
      chargePointId,
      connectorId,
      chargingSchedule: schedule,
    })
  },

  /**
   * Clears a charging profile from the charger.
   */
  async clearChargingProfile(chargePointId: string): Promise<OcppCommandResult> {
    return callOcppService('/ocpp/clear-charging-profile', { chargePointId })
  },

  /**
   * Checks if a charger is currently connected to the OCPP service.
   */
  async isConnected(chargePointId: string): Promise<boolean> {
    try {
      const res = await fetch(`${getOcppServiceUrl()}/ocpp/status/${encodeURIComponent(chargePointId)}`, {
        headers: { 'Authorization': `Bearer ${getOcppServiceSecret()}` },
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return false
      const data = await res.json() as { connected: boolean }
      return data.connected
    } catch {
      return false
    }
  },
}
