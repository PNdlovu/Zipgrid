/**
 * @file route.ts
 * @description POST /api/v1/property/:id/residents — invite a resident by email
 * Rate limited per host (each invite sends an email).
 *
 * @module apps/web/api/v1/property/[id]/residents
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'
import { PropertyService } from '@/domains/property/PropertyService'
import { InviteSchema, firstIssue } from '../../_schemas'

/** POST /api/v1/property/:id/residents — { email, unitNumber? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    const parsed = InviteSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', firstIssue(parsed.error), 422)
    const limit = await rateLimit(`property-invite:${userId}`, 100, 24 * 60 * 60)
    if (!limit.allowed) return apiError('RATE_LIMITED', 'Daily invite limit reached. Try again tomorrow.', 429)
    return apiResponse(await PropertyService.inviteResident(userId, id, parsed.data.email, parsed.data.unitNumber), undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/property/:id/residents')
  }
}
