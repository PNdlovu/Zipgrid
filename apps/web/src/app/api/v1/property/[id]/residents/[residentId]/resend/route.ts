/**
 * @file route.ts
 * @description POST /api/v1/property/:id/residents/:residentId/resend — email a fresh invite link
 *
 * @module apps/web/api/v1/property/[id]/residents/[residentId]/resend
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'
import { PropertyService } from '@/domains/property/PropertyService'

/** POST /api/v1/property/:id/residents/:residentId/resend */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; residentId: string }> }) {
  try {
    const { userId } = requireUser(request)
    const { id, residentId } = await params
    const limit = await rateLimit(`property-invite-resend:${residentId}`, 5, 24 * 60 * 60)
    if (!limit.allowed) return apiError('RATE_LIMITED', 'This invite has been resent too often today.', 429)
    await PropertyService.resendInvite(userId, id, residentId)
    return apiResponse({ resent: true })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/property/:id/residents/:residentId/resend')
  }
}
