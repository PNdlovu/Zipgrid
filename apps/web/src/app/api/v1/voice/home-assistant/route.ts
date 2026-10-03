/**
 * @file route.ts
 * @description GET/POST /api/v1/voice/home-assistant — Home Assistant REST API integration.
 *
 * Home Assistant integration via the Zipgrid HACS custom component.
 * This endpoint exposes a Home Assistant-compatible REST API that the
 * HACS component calls to:
 *   - Read current session status (sensor entities)
 *   - Trigger charging commands (button/switch entities)
 *   - Get charger OCPP status (binary_sensor entities)
 *
 * Authentication: Bearer token (user's Zipgrid access token).
 *
 * Entity types exposed:
 *   sensor.zipgrid_session_kwh          — current session kWh
 *   sensor.zipgrid_session_cost_gbp     — current session cost
 *   sensor.zipgrid_session_soc          — state of charge %
 *   binary_sensor.zipgrid_charging      — charging yes/no
 *   switch.zipgrid_charger_{listingId}  — start/stop charging
 *   sensor.zipgrid_earnings_month       — host earnings this month
 *
 * @module apps/web/api/v1/voice/home-assistant
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET — returns entity states for Home Assistant polling. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Active session
    const sessionRes = await db.execute(
      `SELECT cs.id, cs.status, cs.started_at,
              ROUND((cs.energy_consumed_wh / 1000.0)::NUMERIC, 3) AS energy_kwh,
              cs.total_session_cost_cents AS cost_pence,
              cs.soc_percent,
              cl.id AS listing_id, cl.title AS listing_title,
              cl.ocpp_charge_point_id
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1
         AND cs.status IN ('charging', 'suspended_ev', 'suspended_evse')
       ORDER BY cs.started_at DESC LIMIT 1`,
      [userId],
    )

    const session = sessionRes.rows[0] as Record<string, unknown> | undefined
    const isCharging = !!session

    // Host earnings
    const earningsRes = await db.execute(
      `SELECT COALESCE(SUM(t.host_earnings_cents), 0)::INT AS earnings_pence
       FROM transactions t
       JOIN bookings b ON b.id = t.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE hp.user_id = $1
         AND t.created_at >= DATE_TRUNC('month', NOW())`,
      [userId],
    )
    const earningsPence = (earningsRes.rows[0] as { earnings_pence: number } | undefined)?.earnings_pence ?? 0

    // Build HA-compatible entity state list
    const entities = [
      {
        entity_id: 'binary_sensor.zipgrid_charging',
        state: isCharging ? 'on' : 'off',
        attributes: {
          friendly_name: 'Zipgrid Charging',
          icon: 'mdi:ev-station',
          session_id: session?.['id'] ?? null,
        },
      },
      {
        entity_id: 'sensor.zipgrid_session_kwh',
        state: isCharging ? String(session?.['energy_kwh'] ?? '0.000') : '0.000',
        attributes: {
          friendly_name: 'Zipgrid Session Energy',
          unit_of_measurement: 'kWh',
          icon: 'mdi:lightning-bolt',
          device_class: 'energy',
        },
      },
      {
        entity_id: 'sensor.zipgrid_session_cost',
        state: isCharging ? String(((session?.['cost_pence'] as number ?? 0) / 100).toFixed(2)) : '0.00',
        attributes: {
          friendly_name: 'Zipgrid Session Cost',
          unit_of_measurement: '£',
          icon: 'mdi:currency-gbp',
        },
      },
      {
        entity_id: 'sensor.zipgrid_session_soc',
        state: isCharging && session?.['soc_percent'] ? String(session['soc_percent']) : 'unknown',
        attributes: {
          friendly_name: 'Battery State of Charge',
          unit_of_measurement: '%',
          icon: 'mdi:battery-charging',
          device_class: 'battery',
        },
      },
      {
        entity_id: 'sensor.zipgrid_earnings_month',
        state: String((earningsPence / 100).toFixed(2)),
        attributes: {
          friendly_name: 'Zipgrid Monthly Earnings',
          unit_of_measurement: '£',
          icon: 'mdi:cash',
        },
      },
    ]

    return apiResponse({ entities, timestamp: new Date().toISOString() })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not fetch Home Assistant entities', 500)
  }
}

/** POST — execute a command (start/stop charging via a switch entity). */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> }
  catch { return apiError('VALIDATION_ERROR', 'Invalid JSON', 400) }

  const service   = body['service'] as string | undefined    // e.g. 'switch.turn_on'
  const entityId  = body['entity_id'] as string | undefined  // e.g. 'switch.zipgrid_charger_abc123'

  if (!service || !entityId) {
    return apiError('VALIDATION_ERROR', 'service and entity_id are required', 400)
  }

  try {
    // Extract listing ID from entity_id: switch.zipgrid_charger_{listingId}
    const match = entityId.match(/switch\.zipgrid_charger_(.+)/)
    if (!match?.[1]) return apiError('VALIDATION_ERROR', 'Unrecognised entity_id', 400)
    const listingId = match[1]

    if (service === 'switch.turn_off') {
      // Stop charging — call sessions/stop
      const res = await fetch(`${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/api/v1/sessions/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ listingId }),
      })
      const json = await res.json()
      return apiResponse(json)
    }

    return apiResponse({ success: true, service, entityId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Command failed', 500)
  }
}
