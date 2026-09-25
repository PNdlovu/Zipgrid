/**
 * @file route.ts
 * @description POST /api/v1/auth/logout — clears refresh token cookie.
 * The client is responsible for discarding the access token from memory.
 *
 * @module apps/web/api/v1/auth/logout
 * @access Public (no auth required — safe to call even if already logged out)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { clearRefreshTokenCookie } from '@/lib/cookies'
import { apiResponse } from '@/lib/api/response'

/**
 * POST /api/v1/auth/logout
 * Clears the refresh token cookie. Always returns 200.
 */
export async function POST() {
  const response = apiResponse({ loggedOut: true })
  clearRefreshTokenCookie(response)
  return response
}
