/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-phone/resend
 *
 * Re-generates and re-sends the 6-digit SMS verification OTP via Twilio.
 * Always returns success to prevent phone number enumeration.
 * Rate-limited to 3 resends per 10 minutes per phone number.
 *
 * @module apps/web/api/v1/auth/verify-phone/resend
 * @access Public
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'

const ResendPhoneSchema = z.object({
  phone: z.string().min(10, 'Enter a valid phone number'),
})

/* ── Simple per-phone rate limit ────────────────────────────── */
const resendMap = new Map<string, { count: number; resetAt: number }>()

function checkResendLimit(phone: string): boolean {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const entry = resendMap.get(phone)
  if (!entry || now > entry.resetAt) {
    resendMap.set(phone, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

/**
 * POST /api/v1/auth/verify-phone/resend
 * Re-sends the SMS OTP to the given phone number.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = ResendPhoneSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const phone = parsed.data.phone.replace(/\s+/g, '')

  if (!checkResendLimit(phone)) {
    return apiError(
      'RATE_LIMITED',
      'Too many resend attempts. Please wait a few minutes before trying again.',
      429,
    )
  }

  // Re-generate and send OTP — always return success to prevent enumeration
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const userResult = await db.execute(
      `SELECT id, display_name, phone_verified FROM users WHERE phone = $1 LIMIT 1`,
      [phone],
    )

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0] as {
        id: string
        display_name: string
        phone_verified: boolean
      }

      if (!user.phone_verified) {
        const code = await AuthService.generateOtp(user.id, 'phone')
        await AuthService._sendOtpSms(phone, code)
      }
    }
  } catch {
    // Swallow — always return success to prevent enumeration
  }

  return apiResponse({ sent: true })
}
