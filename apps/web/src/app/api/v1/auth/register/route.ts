/**
 * @file route.ts
 * @description POST /api/v1/auth/register
 * Creates a new Zipgrid account.
 * - Validates input with Zod
 * - Delegates to AuthService.register (bcrypt hash, DB insert, JWT issue)
 * - Returns access token in body + refresh token in HttpOnly cookie
 * - Rate limited: 5 registrations per IP per hour
 *
 * @module apps/web/api/v1/auth/register
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

const RegisterSchema = z.object({
  displayName: z.string().min(2).max(60),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['driver', 'host', 'both']),
})

/* ── Handler ────────────────────────────────────────────────── */

/**
 * POST /api/v1/auth/register
 *
 * Step 1: Validate input
 * Step 2: Call AuthService.register
 * Step 3: Set refresh token cookie
 * Step 4: Return access token + userId in body
 *
 * @throws 422 on validation error
 * @throws 409 if email already registered
 * @throws 500 on unexpected error
 */
export async function POST(request: NextRequest) {
  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  // Validate
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      'VALIDATION_ERROR',
      parsed.error.errors[0]?.message ?? 'Invalid input',
      422,
      parsed.error.flatten(),
    )
  }

  try {
    const tokens = await AuthService.register(parsed.data)

    const response = apiResponse(
      {
        userId: tokens.userId,
        accessToken: tokens.accessToken,
        roles: tokens.roles,
      },
      undefined,
      201,
    )

    setRefreshTokenCookie(response, tokens.refreshToken)

    return response
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code, err.message, err.statusCode)
    }
    console.error('[POST /api/v1/auth/register]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
