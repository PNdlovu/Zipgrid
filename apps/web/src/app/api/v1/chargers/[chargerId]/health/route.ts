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

/**
 * POST /api/v1/chargers/[chargerId]/health
 * Receives fault/status notifications pushed by the OCPP service.
 * Authenticated via OCPP_SERVICE_SECRET (not user JWT).
 * Records the event and optionally notifies the host.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const secret = process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'
  const auth   = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return apiError('UNAUTHORIZED', 'Invalid service secret', 401)
  }

  const { chargerId } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { connectorId, status, errorCode } = body as {
    connectorId?: number
    status?: string
    errorCode?: string
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Look up charger by internal ID to get chargePointId + host
    const deviceRes = await db.execute(
      `SELECT cd.charge_point_id, hp.user_id AS host_user_id
       FROM charger_devices cd
       JOIN host_profiles hp ON hp.id = cd.host_profile_id
       WHERE cd.id = $1 LIMIT 1`,
      [chargerId],
    )
    if (deviceRes.rows.length === 0) {
      return apiError('NOT_FOUND', 'Charger not found', 404)
    }
    const device = deviceRes.rows[0] as { charge_point_id: string; host_user_id: string }

    // Persist fault to ocpp_event_log
    if (status === 'Faulted' && errorCode && errorCode !== 'NoError') {
      const { v4: uuidv4 } = await import('uuid')
      await db.execute(
        `INSERT INTO ocpp_event_log
           (id, charge_point_id, connector_id, action, payload, created_at)
         VALUES ($1, $2, $3, 'StatusNotification', $4::jsonb, NOW())`,
        [
          uuidv4(),
          device.charge_point_id,
          connectorId ?? 0,
          JSON.stringify({ status, errorCode }),
        ],
      )

      // Update device status
      await db.execute(
        `UPDATE charger_devices
         SET current_status = $2, error_code = $3, updated_at = NOW()
         WHERE id = $1`,
        [chargerId, status, errorCode],
      )

      // Best-effort: notify the host
      try {
        const { NotificationService } = await import('@/domains/notifications/NotificationService')
        await NotificationService.send({
          userId: device.host_user_id,
          category: 'system_message',
          title: 'Charger fault reported',
          body: `Charger ${device.charge_point_id} reported a fault: ${errorCode}. Check the charger health page.`,
          actionUrl: `/host/chargers/${chargerId}`,
          channels: ['in_app'],
        })
      } catch {
        // Non-fatal — fault is already logged
      }
    } else if (status) {
      // Non-fault status update
      await db.execute(
        `UPDATE charger_devices
         SET current_status = $2, error_code = $3, updated_at = NOW()
         WHERE id = $1`,
        [chargerId, status, errorCode ?? 'NoError'],
      )
    }

    return apiResponse({ received: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
