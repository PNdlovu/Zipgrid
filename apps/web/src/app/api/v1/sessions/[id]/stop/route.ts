/**
 * @file route.ts
 * @description POST /api/v1/sessions/[id]/stop — stop a live session
 * (driver or host). Final cost is set when the charger reports StopTransaction.
 * @module apps/web/api/v1/sessions/[id]/stop
 */

import { type NextRequest } from 'next/server'
import { SessionService } from '@/domains/sessions/SessionService'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    const { status } = await SessionService.requestStop(id, userId)
    return apiResponse({ stopped: true, sessionId: id, status })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/sessions/[id]/stop')
  }
}
