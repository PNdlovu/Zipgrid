/**
 * @file route.ts
 * @description DELETE /api/v1/property/residencies/:residentId — leave a property
 *
 * @module apps/web/api/v1/property/residencies/[residentId]
 */

import { type NextRequest } from 'next/server'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'

/** DELETE /api/v1/property/residencies/:residentId */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ residentId: string }> }) {
  try {
    const { userId } = requireUser(request)
    const { residentId } = await params
    await PropertyService.leave(userId, residentId)
    return apiResponse({ left: true })
  } catch (err) {
    return errorResponse(err, 'DELETE /api/v1/property/residencies/:residentId')
  }
}
