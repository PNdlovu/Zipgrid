/**
 * @file route.ts
 * @description POST /api/v1/property/invite/accept — { token } — join the property as a resident
 *
 * @module apps/web/api/v1/property/invite/accept
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'
import { TokenSchema } from '../../_schemas'

/** POST /api/v1/property/invite/accept */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const parsed = TokenSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('NOT_FOUND', 'Invite not found', 404)
    return apiResponse(await PropertyService.acceptInvite(userId, parsed.data.token))
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/property/invite/accept')
  }
}
