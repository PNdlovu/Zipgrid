/**
 * @file route.ts
 * @description POST /api/v1/auth/login
 * Authenticates a user with email + password.
 * - Validates input with Zod
 * - Constant-time password check (bcrypt) via AuthService
 * - Returns access token in body, refresh token in HttpOnly cookie
 * - Rate limited: 10 attempts per IP per 15 minutes (handled in middleware)
 *
 * @module apps/web/api/v1/auth/login
 * @access Public
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { setRefreshTokenCookie } from '@/lib/cookies'
import { AppError } from '@/lib/errors/AppError'

/* ── Input schema ───────────────────────────────────────────── */

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
})

/* ── Handler ────────────────────────────────────────────────── */

/**
 * POST /api/v1/auth/login
 *
 * Step 1: Validate input
 * Step 2: AuthService.login — credential check, constant-time compare
 * Step 3: Set HttpOnly refresh token cookie
 * Step 4: Return access token in response body
 *
 * @throws 401 on invalid credentials
 * @throws 403 EMAIL_NOT_VERIFIED
 * @throws 422 on validation error
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      'VALIDATION_ERROR',
      parsed.error.errors[0]?.message ?? 'Invalid input',
      422,
    )
  }

  try {
    const result = await AuthService.login(parsed.data)

    const response = apiResponse({
      userId: result.userId,
      accessToken: result.accessToken,
      roles: result.roles,
      emailVerified: result.emailVerified,
    })

    setRefreshTokenCookie(response, result.refreshToken, parsed.data.rememberMe)

    return response
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code, err.message, err.statusCode)
    }
    console.error('[POST /api/v1/auth/login]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
