/**
 * @file route.ts
 * @description GET /api/v1/auth/oauth/[provider] — OAuth redirect initiator.
 * Redirects the user to the appropriate OAuth provider (Google, Apple).
 * On return, the provider calls /api/v1/auth/oauth/[provider]/callback.
 *
 * Environment variables required:
 *   GOOGLE_CLIENT_ID       — Google OAuth 2.0 client ID
 *   APPLE_CLIENT_ID        — Apple Sign-In service ID (bundle ID format)
 *   NEXT_PUBLIC_APP_URL    — Base URL (used for redirect_uri construction)
 *
 * @module apps/web/api/v1/auth/oauth
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'

const SUPPORTED_PROVIDERS = ['google', 'apple'] as const
type Provider = (typeof SUPPORTED_PROVIDERS)[number]

/** Build the absolute callback URL for a provider */
function callbackUrl(provider: Provider): string {
  const base = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
  return `${base}/api/v1/auth/oauth/${provider}/callback`
}

/** Construct Google OAuth 2.0 authorisation URL */
function googleAuthUrl(state: string): string {
  const clientId = process.env['GOOGLE_CLIENT_ID']
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl('google'),
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Construct Apple Sign-In authorisation URL */
function appleAuthUrl(state: string): string {
  const clientId = process.env['APPLE_CLIENT_ID']
  if (!clientId) throw new Error('APPLE_CLIENT_ID is not set')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl('apple'),
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope:         'name email',
    state,
  })
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params

  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNSUPPORTED_PROVIDER', message: `OAuth provider "${provider}" is not supported.` } },
      { status: 400 },
    )
  }

  // CSRF state token — a short random nonce stored in a cookie
  const state = crypto.randomUUID()

  let authUrl: string
  try {
    authUrl = provider === 'google' ? googleAuthUrl(state) : appleAuthUrl(state)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth is not configured'
    return NextResponse.json(
      { success: false, error: { code: 'OAUTH_NOT_CONFIGURED', message: msg } },
      { status: 503 },
    )
  }

  const response = NextResponse.redirect(authUrl)

  // Store CSRF state in a short-lived httpOnly cookie. Apple returns via a
  // cross-site form POST, which only carries SameSite=None (Secure) cookies.
  const crossSitePost = provider === 'apple'
  response.cookies.set(`__zg_oauth_state_${provider}`, state, {
    httpOnly: true,
    secure:   crossSitePost || process.env['NODE_ENV'] === 'production',
    sameSite: crossSitePost ? 'none' : 'lax',
    maxAge:   600, // 10 minutes
    path:     '/api/v1/auth/oauth',
  })

  return response
}
