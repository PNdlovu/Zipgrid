/**
 * @file route.ts
 * @description POST /api/v1/sessions — start a charging session (OCPP RemoteStart).
 *              GET  /api/v1/sessions — session history for the current driver or host.
 *
 * @module apps/web/api/v1/sessions
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { SessionService } from '@/domains/sessions/SessionService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const StartSessionSchema = z.object({
  bookingId: z.string().uuid(),
  connectorId: z.number().int().positive().max(16).optional(),
})

/** POST /api/v1/sessions — start a charging session (OCPP RemoteStart). */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)

    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = StartSessionSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }

    const result = await SessionService.startRemote({
      userId,
      bookingId: parsed.data.bookingId,
      ...(parsed.data.connectorId !== undefined ? { connectorId: parsed.data.connectorId } : {}),
    })
    return apiResponse(result, undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/sessions')
  }
}

/** GET /api/v1/sessions — session history for the current driver or host. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const { searchParams } = request.nextUrl
    const role = searchParams.get('role') === 'host' ? 'host' : 'driver'
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '50', 10) || 50))
    const statuses = (searchParams.get('status') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

    const { sessions, total } = await SessionService.list(userId, { role, page, pageSize, statuses })
    return apiResponse({ sessions, total }, { page, pageSize, total })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/sessions')
  }
}
