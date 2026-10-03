/**
 * @file route.ts
 * @description PATCH  /api/v1/property/:id/residents/:residentId — update unit number
 *              DELETE /api/v1/property/:id/residents/:residentId — remove resident / cancel invite
 *
 * @module apps/web/api/v1/property/[id]/residents/[residentId]
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'
import { ResidentPatchSchema, firstIssue } from '../../../_schemas'

type Ctx = { params: Promise<{ id: string; residentId: string }> }

/** PATCH /api/v1/property/:id/residents/:residentId — { unitNumber } */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id, residentId } = await params
    const parsed = ResidentPatchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', firstIssue(parsed.error), 422)
    await PropertyService.updateResident(userId, id, residentId, parsed.data.unitNumber)
    return apiResponse({ updated: true })
  } catch (err) {
    return errorResponse(err, 'PATCH /api/v1/property/:id/residents/:residentId')
  }
}

/** DELETE /api/v1/property/:id/residents/:residentId */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id, residentId } = await params
    await PropertyService.removeResident(userId, id, residentId)
    return apiResponse({ removed: true })
  } catch (err) {
    return errorResponse(err, 'DELETE /api/v1/property/:id/residents/:residentId')
  }
}
