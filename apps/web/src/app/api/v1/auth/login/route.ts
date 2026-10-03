/**
 * @file route.ts
 * @description POST /api/v1/auth/login — email + password sign-in.
 * Sets HttpOnly access + refresh cookies; also returns the access token for
 * non-browser clients (mobile) that send `Authorization: Bearer`.
 * Rate limited per IP and per email.
 *
 * @module apps/web/api/v1/auth/login
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse } from '@/lib/api/context'
import { setAuthCookies } from '@/lib/cookies'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const ip = clientIp(request.headers)
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 20, 15 * 60),
    rateLimit(`login:email:${parsed.data.email.toLowerCase()}`, 10, 15 * 60),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    const res = apiError('RATE_LIMITED', 'Too many sign-in attempts — please wait a few minutes and try again.', 429)
    res.headers.set('Retry-After', String(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)))
    return res
  }

  try {
    const result = await AuthService.login(parsed.data, { ip, userAgent: request.headers.get('user-agent') })
    const response = apiResponse({
      userId: result.userId,
      roles: result.roles,
      emailVerified: result.emailVerified,
      accessToken: result.accessToken,
    })
    setAuthCookies(response, result)
    return response
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/auth/login')
  }
}
