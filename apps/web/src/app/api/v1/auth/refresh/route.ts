/**
 * @file route.ts
 * @description POST /api/v1/auth/refresh — rotate the session.
 * Browsers send the refresh cookie; mobile clients may send
 * { refreshToken } in the body. Middleware also refreshes transparently, so
 * browser code rarely needs to call this.
 *
 * @module apps/web/api/v1/auth/refresh
 */

import { type NextRequest } from 'next/server'
import { rotateSession } from '@/lib/auth/sessions'
import { clearAuthCookies, getRefreshTokenFromCookies, setAuthCookies } from '@/lib/cookies'
import { apiResponse, apiError } from '@/lib/api/response'
import { clientIp } from '@/lib/rate-limit'

/** POST /api/v1/auth/refresh — rotate the session. */
export async function POST(request: NextRequest) {
  let token = getRefreshTokenFromCookies(request.cookies)
  if (!token) {
    const body = (await request.json().catch(() => null)) as { refreshToken?: unknown } | null
    if (typeof body?.refreshToken === 'string') token = body.refreshToken
  }
  if (!token) return apiError('MISSING_REFRESH_TOKEN', 'No refresh token provided', 401)

  const tokens = await rotateSession(token, { ip: clientIp(request.headers), userAgent: request.headers.get('user-agent') })
  if (!tokens) {
    const res = apiError('INVALID_REFRESH_TOKEN', 'Session expired — please sign in again', 401)
    clearAuthCookies(res)
    return res
  }

  const response = apiResponse({
    userId: tokens.userId,
    roles: tokens.roles,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  })
  setAuthCookies(response, tokens)
  return response
}
