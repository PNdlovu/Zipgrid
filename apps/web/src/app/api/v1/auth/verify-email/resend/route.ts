/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-email/resend
 *
 * Re-generates and re-sends the 6-digit email verification OTP.
 * Called from the verify-email page when the user clicks "Resend code".
 *
 * Rate-limited to 3 resends per 10 minutes per email address (using the same
 * in-process map as the middleware). This is intentionally lenient because
 * the endpoint is unauthenticated and the code itself is short-lived (10 min).
 *
 * Always returns success regardless of whether the email exists, to prevent
 * account enumeration (same behaviour as requestPasswordReset).
 *
 * @module apps/web/api/v1/auth/verify-email/resend
 * @access Public
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'

const ResendSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

/* ── Simple per-email rate limit (in-process, Edge-compatible) ─ */
const resendMap = new Map<string, { count: number; resetAt: number }>()

function checkResendLimit(email: string): boolean {
  const key = email.toLowerCase().trim()
  const now = Date.now()
  const windowMs = 10 * 60 * 1000 // 10 minutes
  const entry = resendMap.get(key)
  if (!entry || now > entry.resetAt) {
    resendMap.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= 3) return false
  entry.count++
  return true
}

/**
 * POST /api/v1/auth/verify-email/resend
 * Re-sends the email verification OTP code.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = ResendSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const email = parsed.data.email.toLowerCase().trim()

  // Rate-limit check — prevent abuse
  if (!checkResendLimit(email)) {
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
      `SELECT id, display_name, email_verified FROM users WHERE email = $1 LIMIT 1`,
      [email],
    )

    // Silent success if email not found or already verified
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0] as {
        id: string
        display_name: string
        email_verified: boolean
      }

      if (!user.email_verified) {
        const code = await AuthService.generateOtp(user.id, 'email')
        await AuthService._sendOtpEmail(email, user.display_name, code, 'email')
      }
    }
  } catch {
    // Swallow — always return success to prevent enumeration
  }

  return apiResponse({ sent: true })
}
