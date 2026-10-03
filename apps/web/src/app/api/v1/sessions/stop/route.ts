/**
 * @file route.ts
 * @description POST /api/v1/sessions/stop — stop the caller's most recent live
 * session (used by voice/AI flows that don't know the session id).
 * For a specific session use POST /api/v1/sessions/[id]/stop.
 * @module apps/web/api/v1/sessions/stop
 */

import { type NextRequest } from 'next/server'
import { SessionService, LIVE_SESSION_STATUSES } from '@/domains/sessions/SessionService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

/** POST /api/v1/sessions/stop — stop the caller's most recent live session (used by voice/AI flows that don't know the session id). */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const { sessions } = await SessionService.list(userId, {
      role: 'driver',
      pageSize: 1,
      statuses: LIVE_SESSION_STATUSES,
    })
    const live = sessions[0]
    if (!live) return apiError('NOT_FOUND', 'No active charging session found.', 404)

    const { status } = await SessionService.requestStop(live.id, userId)
    return apiResponse({ stopped: true, sessionId: live.id, status })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/sessions/stop')
  }
}
