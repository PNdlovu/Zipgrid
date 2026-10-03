/**
 * @file route.ts
 * @description GET /api/v1/sessions/[id] — session detail for its driver or host.
 * @module apps/web/api/v1/sessions/[id]
 */

import { type NextRequest } from 'next/server'
import { SessionService } from '@/domains/sessions/SessionService'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

type Params = { params: Promise<{ id: string }> }

/** GET /api/v1/sessions/[id] — session detail for its driver or host. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    const session = await SessionService.getById(id, userId)
    return apiResponse(session)
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/sessions/[id]')
  }
}
