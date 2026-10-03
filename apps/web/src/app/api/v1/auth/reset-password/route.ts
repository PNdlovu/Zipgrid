/**
 * @file route.ts
 * @description POST /api/v1/auth/reset-password — email a single-use reset
 * link if the account exists. Always reports success (no account discovery).
 * @module apps/web/api/v1/auth/reset-password
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const ResetRequestSchema = z.object({ email: z.string().email().max(254) })

/** POST /api/v1/auth/reset-password — email a single-use reset link if the account exists. */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }
  const parsed = ResetRequestSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', 'Enter a valid email address', 422)

  const email = parsed.data.email.toLowerCase().trim()
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`reset:ip:${clientIp(request.headers)}`, 10, 60 * 60),
    rateLimit(`reset:email:${email}`, 3, 60 * 60),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    return apiError('RATE_LIMITED', 'Too many reset requests — please try again later.', 429)
  }

  try {
    await AuthService.requestPasswordReset(email)
  } catch (err) {
    console.error('[POST /api/v1/auth/reset-password]', err)
  }
  return apiResponse({ sent: true })
}
