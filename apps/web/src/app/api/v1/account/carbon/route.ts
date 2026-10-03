/**
 * @file route.ts
 * @description GET /api/v1/account/carbon — driver carbon footprint summary.
 *
 * Calculates CO₂ avoided vs. the equivalent ICE (petrol) journey for all
 * completed charging sessions by this driver.
 *
 * Formula (UK average):
 *   UK grid carbon intensity ≈ 233 gCO₂/kWh (2026 DESNZ estimate)
 *   Petrol car average:       ≈ 170 gCO₂/km  (SMMT 2025 fleet average)
 *   EV efficiency:            ≈ 3.5 miles/kWh → 5.63 km/kWh
 *
 *   CO₂ from EV session:  kWh × 233 g
 *   CO₂ from petrol equiv: (kWh × 5.63 km/kWh) × 170 g/km
 *   CO₂ avoided = petrol_equiv - ev_actual  (if positive)
 *
 * @module apps/web/api/v1/account/carbon
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const GRID_INTENSITY_G_PER_KWH   = 233   // UK 2026 grid carbon intensity (gCO₂/kWh)
const PETROL_G_PER_KM            = 170   // Petrol fleet average
const EV_KM_PER_KWH              = 5.63  // 3.5 miles/kWh real-world

/** GET /api/v1/account/carbon — driver carbon footprint summary. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Get all completed sessions for this driver
    const res = await db.execute(
      `SELECT
         cs.energy_consumed_wh,
         cs.total_session_cost_cents,
         cs.started_at,
         EXTRACT(YEAR FROM cs.started_at) AS session_year
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 AND cs.status = 'completed'
       ORDER BY cs.started_at ASC`,
      [userId],
    )

    let totalKwh = 0
    let totalEvCo2Grams = 0
    let totalPetrolCo2Grams = 0

    const yearlyMap: Record<number, { kWh: number; co2AvoidedKg: number; sessions: number }> = {}

    for (const row of res.rows) {
      const r = row as Record<string, unknown>
      const wh = Number(r['energy_consumed_wh'] ?? 0)
      const kwh = wh / 1000
      const year = Number(r['session_year'])

      const evCo2 = kwh * GRID_INTENSITY_G_PER_KWH
      const petrolCo2 = kwh * EV_KM_PER_KWH * PETROL_G_PER_KM

      totalKwh += kwh
      totalEvCo2Grams += evCo2
      totalPetrolCo2Grams += petrolCo2

      if (!yearlyMap[year]) yearlyMap[year] = { kWh: 0, co2AvoidedKg: 0, sessions: 0 }
      yearlyMap[year].kWh += kwh
      yearlyMap[year].co2AvoidedKg += Math.max(0, (petrolCo2 - evCo2) / 1000)
      yearlyMap[year].sessions += 1
    }

    const totalCo2AvoidedKg = Math.max(0, (totalPetrolCo2Grams - totalEvCo2Grams) / 1000)
    const totalSessions = res.rows.length

    // Tree equivalent: average tree absorbs ~21.8 kg CO₂/year
    const treesEquivalent = Math.round(totalCo2AvoidedKg / 21.8)

    // Petrol litres equivalent (1 litre petrol = 2.39 kg CO₂)
    const petrolLitresEquivalent = Math.round(totalCo2AvoidedKg / 2.39)

    const yearly = Object.entries(yearlyMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, data]) => ({
        year: Number(year),
        kWh: Math.round(data.kWh * 100) / 100,
        co2AvoidedKg: Math.round(data.co2AvoidedKg * 100) / 100,
        sessions: data.sessions,
      }))

    return apiResponse({
      totalSessions,
      totalKwh: Math.round(totalKwh * 100) / 100,
      totalCo2AvoidedKg: Math.round(totalCo2AvoidedKg * 100) / 100,
      treesEquivalent,
      petrolLitresEquivalent,
      gridIntensityGPerKwh: GRID_INTENSITY_G_PER_KWH,
      yearly,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/account/carbon]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
