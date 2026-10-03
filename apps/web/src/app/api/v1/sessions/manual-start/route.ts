/**
 * @file route.ts
 * @description POST /api/v1/sessions/manual-start — start a session on a
 * non-smart charger using the 6-digit booking PIN shown to the driver.
 * Stopping uses the normal POST /api/v1/sessions/[id]/stop endpoint.
 *
 * @module apps/web/api/v1/sessions/manual-start
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { SessionService } from '@/domains/sessions/SessionService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const BodySchema = z.object({
  bookingId: z.string().uuid(),
  pin: z.string().regex(/^\d{6}$/, 'PIN must be 6 digits'),
})

/** POST /api/v1/sessions/manual-start — start a session on a non-smart charger using the 6-digit booking PIN shown to the driver. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'bookingId and a 6-digit pin are required', 400)
    }

    const result = await SessionService.startManual({ userId, ...parsed.data })
    return apiResponse(result, undefined, result.alreadyStarted ? 200 : 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/sessions/manual-start')
  }
}
