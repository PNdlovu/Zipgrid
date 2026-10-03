/**
 * @file route.ts
 * @description GET /api/v1/disputes  — cases raised by or against the authenticated user.
 *              POST /api/v1/disputes — open a case on a booking the user drove or hosted.
 *
 * Either party to a booking can open a case; it is raised against the other
 * party. Rules (reporting window, acknowledgement deadline, session snapshot)
 * live in DisputeService. The admin panel (PATCH /api/v1/admin/disputes)
 * resolves cases; both parties add evidence via POST /api/v1/disputes/[id]/evidence.
 *
 * Query params (GET):
 *   status   — filter by dispute status (optional)
 *   page     — 1-based page (default 1)
 *   pageSize — max 50 (default 10)
 *
 * @module apps/web/api/v1/disputes
 * @version 0.2.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { DisputeService, DISPUTE_TYPES } from '@/domains/trust/DisputeService'

const CreateDisputeSchema = z.object({
  disputeType: z.enum(DISPUTE_TYPES),
  description: z.string().trim().min(10, 'Please describe what happened (at least 10 characters)').max(2000),
  bookingId: z.string().trim().min(1, 'Enter the booking reference this case is about').max(36),
})

/** GET /api/v1/disputes — cases raised by or against the authenticated user. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '10', 10) || 10))
    const { disputes, total } = await DisputeService.listForUser(userId, {
      status: searchParams.get('status') ?? undefined,
      page,
      pageSize,
    })
    return apiResponse(disputes, { page, pageSize, total })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/disputes')
  }
}

/** POST /api/v1/disputes — open a case on a booking the user drove or hosted. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = CreateDisputeSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }
    const dispute = await DisputeService.open({
      userId,
      disputeType: parsed.data.disputeType,
      description: parsed.data.description,
      bookingRef: parsed.data.bookingId,
    })
    return apiResponse(dispute, undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/disputes')
  }
}
