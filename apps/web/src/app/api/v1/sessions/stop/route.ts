/**
 * @file route.ts
 * @description POST /api/v1/sessions/stop — stop the caller's currently active session.
 *
 * This convenience endpoint lets the client stop a session without knowing the
 * session ID upfront — it looks up the active session for the authenticated user
 * and forwards the stop command. Useful for the mobile app's "Stop charging" button
 * when the session ID may not be in local state.
 *
 * For session-ID-specific stops use: POST /api/v1/sessions/[id]/stop
 *
 * @module apps/web/api/v1/sessions/stop
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * POST /api/v1/sessions/stop
 * Stops the caller's currently active charging session.
 * Looks up the active session for this user, then forwards RemoteStop to the OCPP service.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Find the active session belonging to this driver
    const sessionRes = await db.execute(
      `SELECT cs.id, cs.ocpp_transaction_id, cs.charge_point_id, cs.status
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1
         AND cs.status IN ('preparing', 'charging', 'paused')
       ORDER BY cs.created_at DESC
       LIMIT 1`,
      [userId],
    )

    if (sessionRes.rows.length === 0) {
      return apiError('NOT_FOUND', 'No active charging session found.', 404)
    }

    const session = sessionRes.rows[0] as {
      id: string
      ocpp_transaction_id: number | null
      charge_point_id: string
      status: string
    }

    // Send RemoteStop via OCPP service
    if (session.ocpp_transaction_id && session.charge_point_id) {
      await OcppService.remoteStop(session.charge_point_id, session.ocpp_transaction_id)
    }

    // Mark session as finishing — OCPP StopTransaction will complete it
    await db.execute(
      `UPDATE charging_sessions
       SET status = 'finishing', updated_at = NOW()
       WHERE id = $1`,
      [session.id],
    )

    return apiResponse({ stopped: true, sessionId: session.id, status: 'finishing' })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/sessions/stop]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
