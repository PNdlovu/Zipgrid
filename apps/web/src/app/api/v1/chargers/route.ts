/**
 * @file route.ts
 * @description GET /api/v1/chargers — list all chargers for the authenticated host.
 * Returns charger devices with live OCPP connection status.
 *
 * @module apps/web/api/v1/chargers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify host profile
    const hostRes = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)
    const hostProfileId = (hostRes.rows[0] as { id: string }).id

    const result = await db.execute(
      `SELECT cd.id, cd.charge_point_id, cd.brand, cd.model,
              cd.current_status AS status, cd.firmware_version,
              cd.last_heartbeat_at, cd.created_at,
              -- Active sessions on this charger
              COUNT(cs.id) FILTER (
                WHERE cs.status IN ('preparing','charging','paused','finishing')
              )::INT AS active_session_count,
              -- Safety score from most recent calculation
              ss.score AS safety_score
       FROM charger_devices cd
       LEFT JOIN charging_sessions cs ON cs.charge_point_id = cd.charge_point_id
       LEFT JOIN LATERAL (
           SELECT overall_score AS score FROM safety_scores
           WHERE listing_id IN (
               SELECT id FROM charger_listings WHERE ocpp_charge_point_id = cd.charge_point_id
           )
           ORDER BY last_calculated_at DESC LIMIT 1
       ) ss ON TRUE
       WHERE cd.host_profile_id = $1
       GROUP BY cd.id, cd.charge_point_id, cd.brand, cd.model,
                cd.current_status, cd.firmware_version,
                cd.last_heartbeat_at, cd.created_at, ss.score
       ORDER BY cd.created_at DESC`,
      [hostProfileId],
    )

    // Check live OCPP connection in parallel
    const rows = result.rows as Record<string, unknown>[]
    const connectedFlags = await Promise.all(
      rows.map((r) => OcppService.isConnected(r['charge_point_id'] as string).catch(() => false)),
    )

    return apiResponse(
      rows.map((r, idx) => ({
        id:                 r['id'],
        chargePointId:      r['charge_point_id'],
        brand:              r['brand'],
        model:              r['model'],
        status:             connectedFlags[idx] ? (r['status'] as string || 'available') : 'offline',
        isConnected:        connectedFlags[idx],
        lastHeartbeat:      r['last_heartbeat_at'],
        firmwareVersion:    r['firmware_version'],
        activeSessionCount: Number(r['active_session_count'] ?? 0),
        safetyScore:        r['safety_score'] != null ? Number(r['safety_score']) : null,
        ocppUrl:            `${process.env['OCPP_CENTRAL_SYSTEM_URL'] ?? 'wss://ocpp.zipgrid.co.uk'}/1.6/${r['charge_point_id']}`,
        createdAt:          r['created_at'],
      })),
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/chargers]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
