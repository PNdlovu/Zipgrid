/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-email/resend — send a new email code.
 * Always reports success so it can't be used to discover registered emails.
 * @module apps/web/api/v1/auth/verify-email/resend
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const ResendSchema = z.object({ email: z.string().email('Enter a valid email address').max(254) })

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

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`resend-email:ip:${clientIp(request.headers)}`, 10, 60 * 60),
    rateLimit(`resend-email:email:${email}`, 3, 10 * 60),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    return apiError('RATE_LIMITED', 'Too many resend attempts. Please wait a few minutes before trying again.', 429)
  }

  try {
    const db = await getDb()
    const res = await db.execute(`SELECT id FROM users WHERE email = $1 AND NOT email_verified`, [email])
    const userId = res.rows[0]?.['id'] as string | undefined
    if (userId) await AuthService.sendEmailVerification(userId)
  } catch (err) {
    console.error('[POST /api/v1/auth/verify-email/resend]', err)
  }
  return apiResponse({ sent: true })
}
