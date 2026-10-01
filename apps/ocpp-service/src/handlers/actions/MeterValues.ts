/**
 * @file MeterValues.ts
 * @description OCPP 1.6J MeterValues handler.
 * Receives periodic energy/power/SoC readings from the charger.
 * Parses the sampledValue array and updates the session record.
 *
 * Supported measurands:
 *   Energy.Active.Import.Register (Wh) — primary energy counter
 *   Power.Active.Import (W)            — instantaneous power
 *   SoC (%)                            — state of charge
 *   Voltage (V)
 *   Current.Import (A)
 *
 * @module apps/ocpp-service/handlers/actions
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { WebSocket } from 'ws'
import { OcppMessageType } from '@zipgrid/types'
import { getDb } from '../db'
import { logger } from '../../lib/logger'

type SampledValue = {
  value: string
  measurand?: string
  unit?: string
  context?: string
  location?: string
  phase?: string
}

type MeterValueEntry = {
  timestamp: string
  sampledValue: SampledValue[]
}

function parseSampledValues(sampledValues: SampledValue[]): {
  energyWh: number | null
  powerW: number | null
  socPercent: number | null
  voltageV: number | null
  currentA: number | null
} {
  let energyWh: number | null = null
  let powerW: number | null = null
  let socPercent: number | null = null
  let voltageV: number | null = null
  let currentA: number | null = null

  for (const sv of sampledValues) {
    const value = parseFloat(sv.value)
    if (isNaN(value)) continue

    const measurand = sv.measurand ?? 'Energy.Active.Import.Register'

    switch (measurand) {
      case 'Energy.Active.Import.Register':
        // Unit can be kWh or Wh — normalise to Wh
        energyWh = sv.unit === 'kWh' ? value * 1000 : value
        break
      case 'Power.Active.Import':
        // Unit can be kW or W — normalise to W
        powerW = sv.unit === 'kW' ? value * 1000 : value
        break
      case 'SoC':
        socPercent = Math.min(100, Math.max(0, value))
        break
      case 'Voltage':
        voltageV = value
        break
      case 'Current.Import':
        currentA = value
        break
    }
  }

  return { energyWh, powerW, socPercent, voltageV, currentA }
}

export async function handleMeterValues(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const transactionId = payload['transactionId'] as number | null | undefined
  const meterValues = (payload['meterValue'] ?? payload['meterValues']) as MeterValueEntry[] | undefined

  if (!meterValues?.length || transactionId == null) {
    ws.send(JSON.stringify([OcppMessageType.CallResult, uniqueId, {}]))
    return
  }

  // Take the last (most recent) meter value entry
  const latest = meterValues[meterValues.length - 1]
  if (!latest) {
    ws.send(JSON.stringify([OcppMessageType.CallResult, uniqueId, {}]))
    return
  }

  const parsed = parseSampledValues(latest.sampledValue ?? [])
  const timestamp = latest.timestamp ? new Date(latest.timestamp) : new Date()

  logger.debug({ chargePointId, transactionId, ...parsed }, 'MeterValues received')

  if (parsed.energyWh !== null) {
    try {
      const db = await getDb()

      // Find active session by transactionId + chargePointId
      const sessionRes = await db.execute(
        `SELECT id, pricing_model, price_per_kwh_cents,
                started_at, idle_fee_per_min_cents, peak_power_w
         FROM charging_sessions
         WHERE charge_point_id = $1
           AND ocpp_transaction_id = $2
           AND status = 'charging'
         LIMIT 1`,
        [chargePointId, transactionId],
      )

      if (sessionRes.rows.length > 0) {
        const session = sessionRes.rows[0] as {
          id: string
          pricing_model: string
          price_per_kwh_cents: number
          started_at: string | null
          idle_fee_per_min_cents: number
          peak_power_w: number | null
        }

        // Calculate running cost
        let runningCostPence = 0
        if (session.pricing_model === 'per_kwh') {
          runningCostPence = Math.round((parsed.energyWh / 1000) * session.price_per_kwh_cents)
        } else if (session.pricing_model === 'per_hour' && session.started_at) {
          const elapsedMinutes =
            (timestamp.getTime() - new Date(session.started_at).getTime()) / 60_000
          runningCostPence = Math.round((elapsedMinutes / 60) * session.price_per_kwh_cents)
        } else if (session.pricing_model === 'per_session') {
          runningCostPence = session.price_per_kwh_cents
        }

        const newPeak = Math.max(
          session.peak_power_w ?? 0,
          parsed.powerW ?? 0,
        )

        await db.execute(
          `UPDATE charging_sessions
           SET energy_consumed_wh = $2,
               power_w = $3,
               soc_percent = $4,
               peak_power_w = $5,
               total_cost_pence = $6,
               updated_at = NOW()
           WHERE id = $1`,
          [
            session.id,
            parsed.energyWh,
            parsed.powerW ?? null,
            parsed.socPercent ?? null,
            newPeak,
            runningCostPence,
          ],
        )
      }
    } catch (err) {
      logger.warn({ chargePointId, transactionId, err }, 'Failed to process MeterValues')
    }
  }

  // OCPP spec requires a response even for MeterValues
  ws.send(JSON.stringify([OcppMessageType.CallResult, uniqueId, {}]))
}
