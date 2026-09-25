/**
 * @file route.ts
 * @description POST /api/v1/auth/refresh — rotate access + refresh tokens.
 * Reads refresh token from HttpOnly cookie, validates it, issues new pair.
 * Implements refresh token rotation — each use issues a new refresh token.
 *
 * @module apps/web/api/v1/auth/refresh
 * @access Requires valid refresh token cookie
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { verifyRefreshToken } from '@/lib/jwt'
import { getRefreshTokenFromCookies, setRefreshTokenCookie } from '@/lib/cookies'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * POST /api/v1/auth/refresh
 * Rotates token pair. Old refresh token is discarded; new pair issued.
 *
 * @throws 401 if refresh token cookie is missing or invalid
 */
export async function POST(request: NextRequest) {
  const refreshToken = getRefreshTokenFromCookies(request.cookies)
  if (!refreshToken) {
    return apiError('MISSING_REFRESH_TOKEN', 'No refresh token provided', 401)
  }

  try {
    const payload = await verifyRefreshToken(refreshToken)
    const tokens = await AuthService.refreshTokens(payload.sub)

    const response = apiResponse({
      accessToken: tokens.accessToken,
      userId: tokens.userId,
      roles: tokens.roles,
    })

    setRefreshTokenCookie(response, tokens.refreshToken)
    return response
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    // JWT errors (expired, invalid) → 401
    return apiError('INVALID_REFRESH_TOKEN', 'Session expired — please sign in again', 401)
  }
}
