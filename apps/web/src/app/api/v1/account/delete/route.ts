/**
 * @file route.ts
 * @description POST /api/v1/account/delete — GDPR Art. 17 right to erasure.
 * Submits a deletion request with a 14-day cooling-off period.
 *
 * GET  — returns current deletion request status (if any).
 * POST — submits a new deletion request.
 * DELETE — cancels a pending deletion request (within the cooling-off window).
 *
 * Deletion anonymises PII after 14 days while retaining transaction records
 * for legal/tax compliance (7-year HMRC retention requirement).
 *
 * @module apps/web/api/v1/account/delete
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { GdprService } from '@/domains/compliance/GdprService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const DeleteRequestSchema = z.object({
  reason: z.string().max(500).optional(),
  /** Explicit confirmation — user must type 'DELETE MY ACCOUNT' to prevent accidental deletions */
  confirmation: z.literal('DELETE MY ACCOUNT', {
    errorMap: () => ({ message: "Please type 'DELETE MY ACCOUNT' to confirm." }),
  }),
})

/** GET /api/v1/account/delete — check if a deletion request is pending */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const deletionRequest = await GdprService.getDeletionRequest(userId)
    return apiResponse({
      hasPendingRequest: deletionRequest !== null,
      request: deletionRequest,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** POST /api/v1/account/delete — submit a deletion request */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = DeleteRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const deletionRequest = await GdprService.requestDeletion(userId, parsed.data.reason)
    return apiResponse({
      message: `Your account deletion has been scheduled for ${deletionRequest.scheduledFor.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. You can cancel this request before then.`,
      scheduledFor: deletionRequest.scheduledFor,
      requestId: deletionRequest.id,
    }, undefined, 202)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/account/delete]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** DELETE /api/v1/account/delete — cancel a pending deletion request */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `UPDATE gdpr_deletion_requests
       SET status = 'rejected', updated_at = NOW()
       WHERE user_id = $1 AND status = 'pending'
       RETURNING id`,
      [userId],
    )

    if (res.rows.length === 0) {
      return apiError('NOT_FOUND', 'No pending deletion request found to cancel.', 404)
    }

    return apiResponse({ cancelled: true, message: 'Your account deletion request has been cancelled.' })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
