/**
 * @file route.ts
 * @description POST /api/v1/auth/logout — revoke the current session and clear
 * auth cookies. Always succeeds.
 * @module apps/web/api/v1/auth/logout
 */

import { type NextRequest } from 'next/server'
import { revokeSession } from '@/lib/auth/sessions'
import { clearAuthCookies, getRefreshTokenFromCookies } from '@/lib/cookies'
import { apiResponse } from '@/lib/api/response'

/** POST /api/v1/auth/logout — revoke the current session and clear auth cookies. */
export async function POST(request: NextRequest) {
  const token = getRefreshTokenFromCookies(request.cookies)
  if (token) await revokeSession(token)
  const response = apiResponse({ loggedOut: true })
  clearAuthCookies(response)
  return response
}
