/**
 * @file MeterValues.ts
 * @description OCPP 1.6J MeterValues handler — live energy, power and SoC.
 *
 * Energy.Active.Import.Register is the charger's cumulative register; it is
 * stored as meter_stop_wh (latest reading) and energy for the session is the
 * generated column energy_consumed_wh = meter_stop_wh − meter_start_wh.
 *
 * @module apps/ocpp-service/handlers/actions
 */

import type { WebSocket } from 'ws'
import { calculateSessionCost, meterDeltaWh, type PricingModel } from '@zipgrid/utils'
import { getDb } from '../db'
import { parseTimestamp, reply } from '../common'
import { logger } from '../../lib/logger'

type SampledValue = {
  value: string
  measurand?: string
  unit?: string
  context?: string
  location?: string
  phase?: string
}

type MeterValueEntry = { timestamp: string; sampledValue: SampledValue[] }

export function parseSampledValues(sampledValues: SampledValue[]): {
  energyWh: number | null
  powerW: number | null
  socPercent: number | null
  voltageV: number | null
  currentA: number | null
} {
  // For additive measurands prefer the un-phased total; otherwise sum phases.
  const totals = new Map<string, number>()
  const phaseSums = new Map<string, number>()
  let socPercent: number | null = null
  let voltageV: number | null = null

  for (const sv of sampledValues) {
    const raw = Number.parseFloat(sv.value)
    if (Number.isNaN(raw)) continue
    const measurand = sv.measurand ?? 'Energy.Active.Import.Register'
    const value = sv.unit === 'kWh' || sv.unit === 'kW' ? raw * 1000 : raw

    if (measurand === 'SoC') {
      socPercent = Math.min(100, Math.max(0, value))
    } else if (measurand === 'Voltage') {
      voltageV ??= value
    } else if (sv.phase) {
      phaseSums.set(measurand, (phaseSums.get(measurand) ?? 0) + value)
    } else {
      totals.set(measurand, value)
    }
  }

  const pick = (m: string): number | null => totals.get(m) ?? phaseSums.get(m) ?? null
  return {
    energyWh: pick('Energy.Active.Import.Register'),
    powerW: pick('Power.Active.Import'),
    socPercent,
    voltageV,
    currentA: pick('Current.Import'),
  }
}

export async function handleMeterValues(
  chargePointId: string,
  uniqueId: string,
  payload: Record<string, unknown>,
  ws: WebSocket,
): Promise<void> {
  const transactionId = payload['transactionId'] as number | null | undefined
  const entries = (payload['meterValue'] ?? []) as MeterValueEntry[]
  const latest = entries[entries.length - 1]

  if (transactionId != null && latest) {
    const parsed = parseSampledValues(latest.sampledValue ?? [])
    const timestamp = parseTimestamp(latest.timestamp)
    try {
      const db = await getDb()
      const res = await db.execute(
        `SELECT id, started_at, meter_start_wh, peak_power_w,
                pricing_model, price_per_kwh_cents, price_per_hour_cents,
                price_per_session_cents, idle_fee_per_min_cents
         FROM charging_sessions
         WHERE charge_point_id = $1 AND ocpp_transaction_id = $2
           AND status IN ('charging', 'paused')
         LIMIT 1`,
        [chargePointId, transactionId],
      )
      const s = res.rows[0]
      if (s) {
        const meterStart = s['meter_start_wh'] != null ? Number(s['meter_start_wh']) : null
        const register = parsed.energyWh != null ? Math.round(parsed.energyWh) : null
        const energyWh = register != null ? meterDeltaWh(meterStart, register) : null
        const cost = energyWh != null
          ? calculateSessionCost({
              tariff: {
                pricingModel: (s['pricing_model'] as PricingModel | null) ?? 'per_kwh',
                pricePerKwhPence: s['price_per_kwh_cents'] as number | null,
                pricePerHourPence: s['price_per_hour_cents'] as number | null,
                pricePerSessionPence: s['price_per_session_cents'] as number | null,
                idleFeePerMinPence: Number(s['idle_fee_per_min_cents'] ?? 0),
              },
              energyWh,
              startedAt: s['started_at'] ? new Date(s['started_at'] as string) : null,
              endedAt: timestamp,
            })
          : null
        const peak = Math.max(Number(s['peak_power_w'] ?? 0), Math.round(parsed.powerW ?? 0))

        await db.execute(
          `UPDATE charging_sessions
           SET meter_stop_wh = COALESCE($2, meter_stop_wh),
               power_w = COALESCE($3, power_w),
               soc_percent = COALESCE($4, soc_percent),
               peak_power_w = $5,
               total_session_cost_cents = COALESCE($6, total_session_cost_cents),
               updated_at = NOW()
           WHERE id = $1`,
          [
            s['id'], register,
            parsed.powerW != null ? Math.round(parsed.powerW) : null,
            parsed.socPercent != null ? Math.round(parsed.socPercent) : null,
            peak,
            cost?.totalPence ?? null,
          ],
        )
        await db.execute(
          `INSERT INTO session_meter_values
             (session_id, recorded_at, energy_wh, power_kw, current_a, voltage_v, soc_pct)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            s['id'], timestamp.toISOString(), energyWh ?? 0,
            parsed.powerW != null ? parsed.powerW / 1000 : null,
            parsed.currentA, parsed.voltageV,
            parsed.socPercent != null ? Math.round(parsed.socPercent) : null,
          ],
        )
      }
    } catch (err) {
      logger.warn({ chargePointId, transactionId, err }, 'Failed to process MeterValues')
    }
  }

  reply(ws, uniqueId, {})
}
