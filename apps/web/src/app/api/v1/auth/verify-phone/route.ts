/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-phone — confirm the SMS code for the
 * signed-in user's own phone number.
 * @module apps/web/api/v1/auth/verify-phone
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'

const VerifyPhoneSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') })

/** POST /api/v1/auth/verify-phone — confirm the SMS code for the signed-in user's own phone number. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = VerifyPhoneSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }
    const limit = await rateLimit(`verify-phone:user:${userId}`, 10, 15 * 60)
    if (!limit.allowed) return apiError('RATE_LIMITED', 'Too many attempts — please wait a few minutes.', 429)

    const db = await getDb()
    const res = await db.execute(`SELECT phone FROM users WHERE id = $1`, [userId])
    const phone = res.rows[0]?.['phone'] as string | null | undefined
    if (!phone) return apiError('NO_PHONE', 'Add a phone number to your profile first.', 422)

    await AuthService.verifyPhone(phone, parsed.data.code)
    return apiResponse({ verified: true })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/auth/verify-phone')
  }
}
