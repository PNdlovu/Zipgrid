/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-email — confirm the 6-digit email code.
 * Codes allow 5 attempts each; the endpoint is also rate limited per IP and email.
 * @module apps/web/api/v1/auth/verify-email
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse } from '@/lib/api/context'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const VerifyEmailSchema = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

/** POST /api/v1/auth/verify-email — confirm the 6-digit email code. */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }
  const parsed = VerifyEmailSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`verify-email:ip:${clientIp(request.headers)}`, 30, 15 * 60),
    rateLimit(`verify-email:email:${parsed.data.email.toLowerCase()}`, 10, 15 * 60),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    return apiError('RATE_LIMITED', 'Too many attempts — please wait a few minutes.', 429)
  }

  try {
    await AuthService.verifyEmail(parsed.data.email, parsed.data.code)
    return apiResponse({ verified: true })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/auth/verify-email')
  }
}
