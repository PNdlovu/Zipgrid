/**
 * @file route.ts
 * @description POST /api/v1/sessions/[id]/stop — driver stops active session.
 * Sends RemoteStopTransaction to OCPP service via OcppService.
 *
 * @module apps/web/api/v1/sessions/[id]/stop
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/v1/sessions/[id]/stop
 * Step 1: Verify session belongs to this user
 * Step 2: Send RemoteStopTransaction via OCPP service
 * Step 3: Mark session as finishing (final state set by OCPP StopTransaction handler)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const result = await db.execute(
      `SELECT cs.id, cs.ocpp_transaction_id, cs.charge_point_id, cs.status
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE cs.id = $1 AND dp.user_id = $2
       LIMIT 1`,
      [id, userId],
    )

    if (result.rows.length === 0) {
      return apiError('NOT_FOUND', 'Session not found', 404)
    }

    const session = result.rows[0] as {
      id: string; ocpp_transaction_id: number | null;
      charge_point_id: string; status: string
    }

    if (!['charging', 'preparing', 'paused'].includes(session.status)) {
      return apiError('INVALID_STATE', `Session is already ${session.status}`, 400)
    }

    if (session.ocpp_transaction_id && session.charge_point_id) {
      await OcppService.remoteStop(session.charge_point_id, session.ocpp_transaction_id)
    }

    // Mark as finishing — OCPP service will set to completed on StopTransaction receipt
    await db.execute(
      `UPDATE charging_sessions SET status = 'finishing', updated_at = NOW() WHERE id = $1`,
      [id],
    )

    return apiResponse({ stopped: true, status: 'finishing' })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/sessions/[id]/stop]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
