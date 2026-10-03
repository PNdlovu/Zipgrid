/**
 * @file route.ts
 * @description POST /api/v1/auth/register — create an account (driver, host or
 * both) with its profiles, send the email verification code and sign in.
 * Rate limited per IP.
 *
 * @module apps/web/api/v1/auth/register
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse } from '@/lib/api/context'
import { setAuthCookies } from '@/lib/cookies'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const RegisterSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['driver', 'host', 'both']),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Service and Privacy Policy to create an account.' }),
  }),
})

/** POST /api/v1/auth/register — create an account (driver, host or both) with its profiles, send the email verification code and sign in. */
export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers)
  const limit = await rateLimit(`register:ip:${ip}`, 5, 60 * 60)
  if (!limit.allowed) {
    const res = apiError('RATE_LIMITED', 'Too many sign-ups from this network — please try again later.', 429)
    res.headers.set('Retry-After', String(limit.retryAfterSeconds))
    return res
  }

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422, parsed.error.flatten())
  }

  try {
    const result = await AuthService.register(parsed.data, { ip, userAgent: request.headers.get('user-agent') })
    const response = apiResponse(
      {
        userId: result.userId,
        roles: result.roles,
        requiresVerification: result.requiresVerification,
        accessToken: result.accessToken,
      },
      undefined,
      201,
    )
    setAuthCookies(response, result)
    return response
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/auth/register')
  }
}
