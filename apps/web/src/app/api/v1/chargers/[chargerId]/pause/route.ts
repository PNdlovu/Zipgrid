/**
 * @file route.ts
 * @description POST /api/v1/chargers/[chargerId]/pause
 *
 * Sets the charger connector to Inoperative via OCPP ChangeAvailability.
 * Used by hosts to temporarily take a charger offline without unpairing it.
 * Only the charger owner may call this endpoint.
 *
 * @module apps/web/api/v1/chargers/[chargerId]/pause
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ chargerId: string }> }

/**
 * POST /api/v1/chargers/[chargerId]/pause
 * Sends ChangeAvailability(Inoperative) to the charger.
 * The charger will stop accepting new sessions until resumed.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership and get chargePointId
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

    // Block pause if there is an active session on this charger
    const activeRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt
       FROM charging_sessions
       WHERE charge_point_id = $1
         AND status IN ('preparing', 'charging', 'paused', 'finishing')`,
      [row.charge_point_id],
    )
    if ((activeRes.rows[0] as { cnt: number }).cnt > 0) {
      return apiError(
        'ACTIVE_SESSION',
        'Cannot pause a charger with an active session. Stop the session first.',
        409,
      )
    }

    // Send ChangeAvailability(Inoperative) to connector 0 = whole charger
    const result = await OcppService.changeAvailability(row.charge_point_id, 0, false)

    // Update local status regardless of OCPP response (best-effort)
    await db.execute(
      `UPDATE charger_devices
       SET current_status = 'Unavailable', updated_at = NOW()
       WHERE id = $1`,
      [chargerId],
    )

    return apiResponse({ paused: true, ocppStatus: result.status })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/chargers/[id]/pause]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
