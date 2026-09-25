/**
 * @file cookies.ts
 * @description Secure cookie helpers for auth token management.
 * Refresh token stored as HttpOnly, Secure, SameSite=Lax cookie.
 *
 * @module apps/web/lib
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextResponse } from 'next/server'
import { REFRESH_TOKEN_COOKIE } from './jwt'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * Sets the refresh token as a secure HttpOnly cookie on the response.
 */
export function setRefreshTokenCookie(
  response: NextResponse,
  token: string,
  rememberMe = false,
): void {
  const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7 // 30d or 7d
  response.cookies.set(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
}

/**
 * Clears the refresh token cookie (sets it with maxAge=0).
 */
export function clearRefreshTokenCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

/**
 * Extracts the refresh token from request cookies.
 */
export function getRefreshTokenFromCookies(
  cookies: { get: (name: string) => { value: string } | undefined },
): string | null {
  return cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
