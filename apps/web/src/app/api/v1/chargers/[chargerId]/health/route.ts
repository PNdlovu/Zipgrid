/**
 * @file route.ts
 * @description GET /api/v1/chargers/[chargerId]/health — charger health and live status.
 * Combines DB state with live connection status from OCPP service.
 *
 * @module apps/web/api/v1/chargers/[chargerId]/health
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ chargerId: string }> }

/** GET /api/v1/chargers/[chargerId]/health */
export async function GET(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const result = await db.execute(
      `SELECT cd.id, cd.charge_point_id, cd.brand, cd.model, cd.status,
              cd.firmware_version, cd.last_heartbeat_at, cd.last_seen_at,
              cd.health_score, cd.active_sessions_count
       FROM charger_devices cd
       JOIN host_profiles hp ON hp.id = cd.host_profile_id
       WHERE cd.id = $1 AND hp.user_id = $2
       LIMIT 1`,
      [chargerId, userId],
    )

    if (result.rows.length === 0) {
      return apiError('NOT_FOUND', 'Charger not found', 404)
    }

    const row = result.rows[0] as {
      id: string; charge_point_id: string; brand: string; model: string;
      status: string; firmware_version: string | null; last_heartbeat_at: string | null;
      last_seen_at: string | null; health_score: number | null; active_sessions_count: number
    }

    // Check live connection status from OCPP service
    const connected = await OcppService.isConnected(row.charge_point_id)

    // Get recent faults
    const faultResult = await db.execute(
      `SELECT error_code, timestamp, resolved
       FROM ocpp_event_log
       WHERE charge_point_id = $1 AND event_type = 'Faulted'
       ORDER BY timestamp DESC LIMIT 10`,
      [row.charge_point_id],
    )

    return apiResponse({
      chargerId: row.id,
      chargePointId: row.charge_point_id,
      brand: row.brand,
      model: row.model,
      connected,
      status: connected ? (row.status || 'Available') : 'Offline',
      firmwareVersion: row.firmware_version,
      lastHeartbeat: row.last_heartbeat_at,
      lastSeen: row.last_seen_at,
      healthScore: row.health_score ?? 85,
      activeSessions: row.active_sessions_count ?? 0,
      faults: faultResult.rows.map((f) => ({
        errorCode: f['error_code'],
        timestamp: f['timestamp'],
        resolved: Boolean(f['resolved']),
      })),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
