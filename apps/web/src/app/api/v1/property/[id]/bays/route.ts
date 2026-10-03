/**
 * @file route.ts
 * @description POST /api/v1/property/:id/bays — add one of the host's listings as a bay
 *
 * @module apps/web/api/v1/property/[id]/bays
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'
import { BayCreateSchema, firstIssue } from '../../_schemas'

/** POST /api/v1/property/:id/bays — { listingId, bayLabel? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    const parsed = BayCreateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', firstIssue(parsed.error), 422)
    return apiResponse(await PropertyService.addBay(userId, id, parsed.data.listingId, parsed.data.bayLabel), undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/property/:id/bays')
  }
}
