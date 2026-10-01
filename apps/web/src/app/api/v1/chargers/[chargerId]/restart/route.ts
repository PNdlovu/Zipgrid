/**
 * @file route.ts
 * @description POST /api/v1/chargers/[chargerId]/restart
 *
 * Sends an OCPP Reset (Soft) command to the charger, then marks it
 * Operative again so it accepts new sessions after rebooting.
 * Only the charger owner may call this endpoint.
 *
 * A soft reset asks the charger to finish any ongoing transaction before
 * resetting. If the charger is offline the command is sent optimistically
 * and the status is updated so the next heartbeat re-syncs the state.
 *
 * @module apps/web/api/v1/chargers/[chargerId]/restart
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ chargerId: string }> }

/**
 * POST /api/v1/chargers/[chargerId]/restart
 * Triggers a soft reset on the charger via the OCPP service.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership
    const res = await db.execute(
      `SELECT cd.id, cd.charge_point_id
       FROM charger_devices cd
       JOIN host_profiles hp ON hp.id = cd.host_profile_id
       WHERE cd.id = $1 AND hp.user_id = $2
       LIMIT 1`,
      [chargerId, userId],
    )
    if (res.rows.length === 0) {
      return apiError('NOT_FOUND', 'Charger not found', 404)
    }

    const row = res.rows[0] as { id: string; charge_point_id: string }

    // Send Reset (Soft) to the OCPP service
    const ocppServiceUrl = process.env['OCPP_SERVICE_URL'] ?? 'http://localhost:3001'
    const ocppSecret    = process.env['OCPP_SERVICE_SECRET'] ?? 'dev-ocpp-secret'

    let ocppStatus = 'Unknown'
    try {
      const ocppRes = await fetch(`${ocppServiceUrl}/ocpp/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ocppSecret}`,
        },
        body: JSON.stringify({ chargePointId: row.charge_point_id, type: 'Soft' }),
        signal: AbortSignal.timeout(10_000),
      })
      if (ocppRes.ok) {
        const data = await ocppRes.json() as { status: string }
        ocppStatus = data.status
      }
    } catch {
      // Non-fatal — charger may be offline; status update below still applies
      ocppStatus = 'Offline'
    }

    // Mark charger as restarting; next heartbeat will update status
    await db.execute(
      `UPDATE charger_devices
       SET current_status = 'Rebooting', error_code = NULL, updated_at = NOW()
       WHERE id = $1`,
      [chargerId],
    )

    return apiResponse({ restarted: true, ocppStatus })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/chargers/[id]/restart]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
