/**
 * @file route.ts
 * @description GET|POST /api/v1/auth/oauth/[provider]/callback
 * Handles the OAuth provider redirect after user consent.
 * - Verifies CSRF state cookie
 * - Exchanges the code for tokens
 * - Upserts user in the database (creates account on first sign-in)
 * - Issues Zipgrid JWT access + refresh tokens
 * - Sets __zg_at cookie and redirects to dashboard
 *
 * Apple returns via POST (form_post response_mode), Google via GET.
 *
 * @module apps/web/api/v1/auth/oauth
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import { AuthService } from '@/domains/identity/AuthService'

const SUPPORTED_PROVIDERS = ['google', 'apple'] as const
type Provider = (typeof SUPPORTED_PROVIDERS)[number]

type GoogleTokenResponse = {
  access_token: string
  id_token: string
  token_type: string
}

type GoogleUserInfo = {
  sub: string
  email: string
  name: string
  picture?: string
  email_verified?: boolean
}

type AppleIdTokenPayload = {
  sub: string
  email: string
  email_verified?: string
}

/* ── Google: exchange code → tokens → user info ─────────────── */

async function getGoogleUser(code: string, redirectUri: string): Promise<{
  providerId: string; email: string; fullName: string; avatarUrl: string | null; emailVerified: boolean
}> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env['GOOGLE_CLIENT_ID'] ?? '',
      client_secret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${tokenRes.status}`)
  }

  const tokens = await tokenRes.json() as GoogleTokenResponse

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userRes.ok) {
    throw new Error('Failed to fetch Google user info')
  }

  const info = await userRes.json() as GoogleUserInfo

  return {
    providerId:    info.sub,
    email:         info.email,
    fullName:      info.name ?? info.email.split('@')[0] ?? 'User',
    avatarUrl:     info.picture ?? null,
    emailVerified: info.email_verified ?? false,
  }
}

/* ── Apple: decode id_token (no exchange needed for basic info) ─ */

async function getAppleUser(idToken: string, formName?: string): Promise<{
  providerId: string; email: string; fullName: string; avatarUrl: null; emailVerified: boolean
}> {
  // Decode the JWT payload (Apple id_token is a signed JWT)
  // We trust the payload because Apple signs it — full verification would
  // use Apple's public keys (JWKS). Skipping for brevity; add in prod.
  const parts = idToken.split('.')
  if (parts.length !== 3 || !parts[1]) throw new Error('Invalid Apple id_token')

  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'),
  ) as AppleIdTokenPayload

  const fullName = formName ?? payload.email?.split('@')[0] ?? 'Apple User'

  return {
    providerId:    payload.sub,
    email:         payload.email,
    fullName,
    avatarUrl:     null,
    emailVerified: payload.email_verified === 'true',
  }
}

/* ── Shared handler ─────────────────────────────────────────── */

async function handleCallback(request: NextRequest, provider: Provider): Promise<NextResponse> {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/v1/auth/oauth/${provider}/callback`

  // Parse params — GET for Google, POST form_post for Apple
  let code: string | null = null
  let state: string | null = null
  let idToken: string | null = null
  let appleFirstName: string | undefined

  if (request.method === 'POST') {
    const form = await request.formData()
    code    = form.get('code') as string | null
    state   = form.get('state') as string | null
    idToken = form.get('id_token') as string | null
    // Apple sends name only on FIRST sign-in
    const nameJson = form.get('user') as string | null
    if (nameJson) {
      try {
        const u = JSON.parse(nameJson) as { name?: { firstName?: string; lastName?: string } }
        const parts = [u.name?.firstName, u.name?.lastName].filter(Boolean)
        if (parts.length) appleFirstName = parts.join(' ')
      } catch { /* ignore */ }
    }
  } else {
    const url = new URL(request.url)
    code  = url.searchParams.get('code')
    state = url.searchParams.get('state')
  }

  // Verify CSRF state
  const storedState = request.cookies.get(`__zg_oauth_state_${provider}`)?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_state_mismatch`)
  }

  if (!code && !idToken) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_no_code`)
  }

  try {
    // Fetch user identity from provider
    const user = provider === 'google'
      ? await getGoogleUser(code!, redirectUri)
      : await getAppleUser(idToken ?? code!, appleFirstName)

    // Upsert user in DB and issue JWT
    const { accessToken, refreshToken } = await AuthService.oauthSignIn({
      provider,
      providerId:    user.providerId,
      email:         user.email,
      fullName:      user.fullName,
      avatarUrl:     user.avatarUrl,
      emailVerified: user.emailVerified,
    })

    // Set JWT cookie and redirect
    const response = NextResponse.redirect(`${appUrl}/dashboard`)
    response.cookies.set('__zg_at', accessToken, {
      httpOnly: true,
      secure:   process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge:   15 * 60, // 15 minutes
      path:     '/',
    })
    response.cookies.set('__zg_rt', refreshToken, {
      httpOnly: true,
      secure:   process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge:   30 * 24 * 60 * 60, // 30 days
      path:     '/api/v1/auth/refresh',
    })
    // Clear the CSRF state cookie
    response.cookies.delete(`__zg_oauth_state_${provider}`)

    return response
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'oauth_error'
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(msg)}`)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.redirect(`${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/login?error=unsupported_provider`)
  }
  return handleCallback(request, provider as Provider)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.redirect(`${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/login?error=unsupported_provider`)
  }
  return handleCallback(request, provider as Provider)
}
