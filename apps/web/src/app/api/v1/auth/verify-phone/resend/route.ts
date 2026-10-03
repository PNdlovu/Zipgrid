/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-phone/resend — text a new code to the
 * signed-in user's own (unverified) phone number. Rate limited per user.
 * @module apps/web/api/v1/auth/verify-phone/resend
 */

import { type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'

/** POST /api/v1/auth/verify-phone/resend — text a new code to the signed-in user's own (unverified) phone number. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const limit = await rateLimit(`resend-phone:user:${userId}`, 3, 10 * 60)
    if (!limit.allowed) {
      return apiError('RATE_LIMITED', 'Too many resend attempts. Please wait a few minutes before trying again.', 429)
    }

    const db = await getDb()
    const res = await db.execute(`SELECT phone, phone_verified FROM users WHERE id = $1`, [userId])
    const u = res.rows[0]
    if (!u?.['phone']) return apiError('NO_PHONE', 'Add a phone number to your profile first.', 422)
    if (u['phone_verified']) return apiResponse({ sent: false, alreadyVerified: true })

    await AuthService.sendPhoneVerification(userId, u['phone'] as string)
    return apiResponse({ sent: true })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/auth/verify-phone/resend')
  }
}
