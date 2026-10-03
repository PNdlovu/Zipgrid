/**
 * @file route.ts
 * @description GET /api/v1/host/chargers/health
 * Returns OCPP health, fault history, safety score, uptime, and
 * predictive maintenance warnings for all chargers owned by the host.
 *
 * @module apps/web/api/v1/host/chargers/health
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify host
    const hostRes = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)
    const hostProfileId = (hostRes.rows[0] as { id: string }).id

    // Fetch all listings with OCPP data, safety scores, and recent faults
    const listingsRes = await db.execute(
      `SELECT
         cl.id                       AS listing_id,
         cl.title,
         cl.is_smart_charger,
         cl.is_networked,
         cl.ocpp_charge_point_id,
         -- Safety score
         ss.overall_score            AS safety_score,
         ss.auto_paused,
         -- Charger device (OCPP live state from charger_devices table)
         cd.last_heartbeat_at,
         (SELECT string_agg(cc.connector_id || ':' || cc.status, ',' ORDER BY cc.connector_id)
            FROM charger_connectors cc WHERE cc.charge_point_id = cl.ocpp_charge_point_id) AS connector_status,
         cd.firmware_version,
         -- Charger age
         ss.charger_install_year,
         -- Fault history (last 30 days)
         COALESCE(faults.fault_count, 0)::INT   AS fault_count_30d,
         faults.last_fault_at,
         faults.last_fault_code,
         -- Completed sessions (for uptime calculation)
         COALESCE(sessions.session_count, 0)::INT AS session_count_30d
       FROM charger_listings cl
       LEFT JOIN safety_scores ss ON ss.listing_id = cl.id
       LEFT JOIN charger_devices cd ON cd.charge_point_id = cl.ocpp_charge_point_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE oel.error_code IS NOT NULL) AS fault_count,
           MAX(oel.timestamp)
             FILTER (WHERE oel.error_code IS NOT NULL)        AS last_fault_at,
           (ARRAY_AGG(oel.error_code ORDER BY oel.timestamp DESC)
             FILTER (WHERE oel.error_code IS NOT NULL))[1]    AS last_fault_code
         FROM ocpp_event_log oel
         WHERE oel.charge_point_id = cl.ocpp_charge_point_id
           AND oel.timestamp >= NOW() - INTERVAL '30 days'
       ) faults ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::INT AS session_count
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         WHERE b.listing_id = cl.id
           AND cs.status = 'completed'
           AND cs.created_at >= NOW() - INTERVAL '30 days'
       ) sessions ON TRUE
       WHERE cl.host_profile_id = $1
         AND cl.status != 'deactivated'
       ORDER BY cl.created_at DESC`,
      [hostProfileId],
    )

    type RawRow = {
      listing_id: string
      title: string
      is_smart_charger: boolean
      is_networked: boolean
      ocpp_charge_point_id: string | null
      safety_score: number | null
      auto_paused: boolean
      last_heartbeat_at: string | null
      connector_status: string | null
      firmware_version: string | null
      charger_install_year: number | null
      fault_count_30d: number
      last_fault_at: string | null
      last_fault_code: string | null
      session_count_30d: number
    }

    const SAFETY_BANDS: Record<string, string> = {
      excellent: 'excellent', good: 'good', fair: 'fair', needs_attention: 'needs_attention',
    }
    function scoreToBand(score: number | null) {
      if (score == null) return null
      if (score >= 90) return 'excellent'
      if (score >= 70) return 'good'
      if (score >= 50) return 'fair'
      return 'needs_attention'
    }

    const now = Date.now()

    const chargers = (listingsRes.rows as RawRow[]).map((row) => {
      // Connectivity state
      const lastHb = row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : null
      const lastHbAgoSecs = lastHb != null ? Math.floor((now - lastHb) / 1000) : null
      const connected = row.is_networked && lastHb != null && lastHbAgoSecs != null && lastHbAgoSecs < 180

      // Uptime (rough: sessions / (30 * 24h / avg session length))
      // Reported as percentage of 30d available hours used for active sessions
      const uptimePct30d = row.session_count_30d > 0
        ? Math.min(99, Math.round((row.session_count_30d / (30 * 12)) * 100)) // assuming ~2h avg session
        : null

      // Predictive maintenance warnings
      const warnings: string[] = []
      if (row.charger_install_year) {
        const age = new Date().getFullYear() - row.charger_install_year
        if (age >= 8) warnings.push(`Charger is ${age} years old — consider scheduling a safety inspection.`)
        else if (age >= 5) warnings.push(`Charger is ${age} years old — approaching recommended inspection age.`)
      }
      if (row.fault_count_30d >= 5) {
        warnings.push(`${row.fault_count_30d} faults in the last 30 days — high fault rate. Check hardware.`)
      } else if (row.fault_count_30d >= 2) {
        warnings.push(`${row.fault_count_30d} faults in the last 30 days — monitor closely.`)
      }
      if (!row.is_networked) {
        warnings.push('Non-networked charger — real-time monitoring not available.')
      }
      if (row.auto_paused) {
        warnings.push('Auto-paused due to low safety score. Review safety checklist to reactivate.')
      }

      return {
        listingId:              row.listing_id,
        ocppChargePointId:      row.ocpp_charge_point_id,
        title:                  row.title,
        isSmartCharger:         row.is_smart_charger,
        isNetworked:            row.is_networked,
        connected,
        lastHeartbeatAt:        row.last_heartbeat_at,
        lastHeartbeatAgoSeconds: lastHbAgoSecs,
        connectorStatus:        row.connector_status as string | null,
        faultCount30d:          row.fault_count_30d,
        lastFaultAt:            row.last_fault_at,
        lastFaultCode:          row.last_fault_code,
        safetyScore:            row.safety_score != null ? Number(row.safety_score) : null,
        safetyBand:             scoreToBand(row.safety_score ? Number(row.safety_score) : null),
        autoPaused:             Boolean(row.auto_paused),
        chargerAgeYears:        row.charger_install_year
          ? new Date().getFullYear() - row.charger_install_year
          : null,
        maintenanceWarnings:    warnings,
        uptimePct30d,
      }
    })

    return apiResponse({ chargers })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[host/chargers/health]', err)
    return apiError('INTERNAL_ERROR', 'Could not load charger health data', 500)
  }
}
