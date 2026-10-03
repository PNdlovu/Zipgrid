/**
 * @file cookies.ts
 * @description Auth cookies. Both tokens are HttpOnly, so page scripts (and any
 * injected XSS) can never read them.
 *
 *   __zg_at  access token  (15 min)        — read by middleware
 *   __zg_rt  refresh token (7 / 30 days)   — read by middleware and /auth/refresh
 *
 * SameSite=Lax blocks cross-site POSTs; middleware additionally checks Origin on
 * cookie-authenticated state-changing requests.
 *
 * @module lib/cookies
 */

import { type NextResponse } from 'next/server'
import { REFRESH_TOKEN_COOKIE } from './jwt'

export const ACCESS_TOKEN_COOKIE = '__zg_at'

const ACCESS_MAX_AGE = 15 * 60
const secure = () => process.env.NODE_ENV === 'production'

/** Sets both auth cookies on a response. */
export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string; rememberMe?: boolean },
): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  })
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: 'lax',
    path: '/',
    maxAge: (tokens.rememberMe ? 30 : 7) * 24 * 60 * 60,
  })
}

/** Clears both auth cookies. */
export function clearAuthCookies(response: NextResponse): void {
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    response.cookies.set(name, '', { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: 0 })
  }
}

/** Extracts the refresh token from request cookies. */
export function getRefreshTokenFromCookies(
  cookies: { get: (name: string) => { value: string } | undefined },
): string | null {
  return cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
