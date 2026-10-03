/**
 * @file route.ts
 * @description PATCH  /api/v1/property/:id/bays/:bayId — relabel / (un)assign a resident
 *              DELETE /api/v1/property/:id/bays/:bayId — remove the bay (listing stays live)
 *
 * @module apps/web/api/v1/property/[id]/bays/[bayId]
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'
import { BayPatchSchema, firstIssue } from '../../../_schemas'

type Ctx = { params: Promise<{ id: string; bayId: string }> }

/** PATCH /api/v1/property/:id/bays/:bayId — { bayLabel?, assignedResidentId? } */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id, bayId } = await params
    const parsed = BayPatchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', firstIssue(parsed.error), 422)
    await PropertyService.updateBay(userId, id, bayId, parsed.data)
    return apiResponse({ updated: true })
  } catch (err) {
    return errorResponse(err, 'PATCH /api/v1/property/:id/bays/:bayId')
  }
}

/** DELETE /api/v1/property/:id/bays/:bayId */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id, bayId } = await params
    await PropertyService.removeBay(userId, id, bayId)
    return apiResponse({ removed: true })
  } catch (err) {
    return errorResponse(err, 'DELETE /api/v1/property/:id/bays/:bayId')
  }
}
