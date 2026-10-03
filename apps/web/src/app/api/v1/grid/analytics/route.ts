/**
 * @file route.ts
 * @description GET /api/v1/grid/analytics — Grid demand analytics API.
 * Provides anonymised, aggregated session data for utilities, councils,
 * and National Grid ESO for demand forecasting.
 *
 * POST /api/v1/grid/demand-response — National Grid ESO demand response signal.
 * When National Grid requests demand reduction, this endpoint fans out to
 * drivers with auto-scheduling to delay or reduce session power.
 *
 * API key required: X-Grid-Api-Key header.
 * Intended consumers: utilities, councils, ESO.
 *
 * @module apps/web/api/v1/grid/analytics
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { hasValidServiceSecret } from '@/lib/env'

/** Verify grid API key. */
function verifyGridKey(request: NextRequest): boolean {
  return hasValidServiceSecret(request.headers, 'GRID_API_KEY', 'x-grid-api-key')
}

/** GET /api/v1/grid/analytics — anonymised demand data. */
export async function GET(request: NextRequest) {
  if (!verifyGridKey(request)) return apiError('UNAUTHORIZED', 'Invalid grid API key', 401)

  const { searchParams } = request.nextUrl
  const from     = searchParams.get('from') ?? new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]!
  const to       = searchParams.get('to')   ?? new Date().toISOString().split('T')[0]!
  const interval = searchParams.get('interval') ?? '1h' // 30m | 1h | 24h
  const region   = searchParams.get('region') ?? null

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const truncUnit = interval === '30m' ? '30 minutes' : interval === '24h' ? '1 day' : '1 hour'

    const params: unknown[] = [`${from}T00:00:00Z`, `${to}T23:59:59Z`]
    let regionFilter = ''
    if (region) {
      params.push(`%${region}%`)
      regionFilter = `AND LOWER(cl.city) LIKE LOWER($${params.length})`
    }

    const res = await db.execute(
      `SELECT
         DATE_TRUNC('${truncUnit}', cs.started_at)  AS window_start,
         COUNT(cs.id)::INT                          AS session_count,
         ROUND(SUM(smv.power_kw)::NUMERIC / COUNT(smv.id), 2) AS avg_power_kw,
         ROUND(MAX(smv.power_kw)::NUMERIC, 2)       AS peak_power_kw,
         ROUND(SUM(cs.energy_consumed_wh) / 1000.0, 2) AS total_kwh,
         COUNT(DISTINCT cl.city)::INT               AS city_count
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       LEFT JOIN session_meter_values smv ON smv.session_id = cs.id
       WHERE cs.started_at BETWEEN $1 AND $2
         AND cs.status = 'completed'
         ${regionFilter}
       GROUP BY DATE_TRUNC('${truncUnit}', cs.started_at)
       ORDER BY window_start ASC`,
      params,
    )

    // Aggregate summary
    const rows = res.rows as Record<string, unknown>[]
    const totalSessions = rows.reduce((s, r) => s + Number(r['session_count']), 0)
    const totalKwh      = rows.reduce((s, r) => s + Number(r['total_kwh']), 0)
    const peakPower     = Math.max(0, ...rows.map((r) => Number(r['peak_power_kw'])))

    return apiResponse({
      from,
      to,
      interval,
      region: region ?? 'all',
      summary: { totalSessions, totalKwhDelivered: Math.round(totalKwh), peakPowerKw: peakPower },
      timeSeries: rows,
      dataClassification: 'ANONYMISED_AGGREGATE',
      licence: 'Zipgrid Grid Intelligence Data — for utility/ESO use only. Not for redistribution.',
    })
  } catch (err) {
    console.error('[grid/analytics]', err)
    return apiError('INTERNAL_ERROR', 'Could not generate grid analytics', 500)
  }
}

/** POST /api/v1/grid/demand-response — National Grid ESO demand signal. */
export async function POST(request: NextRequest) {
  if (!verifyGridKey(request)) return apiError('UNAUTHORIZED', 'Invalid grid API key', 401)

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> }
  catch { return apiError('VALIDATION_ERROR', 'Invalid JSON', 400) }

  const signalType  = body['signalType'] as string  // 'reduce' | 'pause' | 'resume'
  const targetKw    = body['targetKw']   as number  // target demand reduction in kW
  const region      = body['region']     as string | undefined
  const validUntil  = body['validUntil'] as string  // ISO 8601

  if (!signalType || !targetKw || !validUntil) {
    return apiError('VALIDATION_ERROR', 'signalType, targetKw, validUntil required', 400)
  }

  // Log demand response event — in production, fan out to smart chargers via OCPP SetChargingProfile
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  await db.execute(
    `INSERT INTO grid_demand_signals (id, signal_type, target_kw, region, valid_until, received_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT DO NOTHING`,
    [crypto.randomUUID(), signalType, targetKw, region ?? 'all', validUntil],
  )

  return apiResponse({
    accepted: true,
    signalType,
    targetKw,
    affectedChargers: 0,  // TODO: wire to OCPP SetChargingProfile
    validUntil,
  })
}
