/**
 * @file route.ts
 * @description GET /api/v1/property/invite?token= — what an invite is for (no side effects)
 *
 * @module apps/web/api/v1/property/invite
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'

/** GET /api/v1/property/invite?token= — invite preview for the accept page. */
export async function GET(request: NextRequest) {
  try {
    requireUser(request)
    const token = request.nextUrl.searchParams.get('token') ?? ''
    if (token.length < 20) return apiError('NOT_FOUND', 'Invite not found', 404)
    return apiResponse(await PropertyService.previewInvite(token))
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/property/invite')
  }
}
