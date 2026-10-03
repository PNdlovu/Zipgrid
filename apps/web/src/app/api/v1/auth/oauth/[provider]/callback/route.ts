/**
 * @file route.ts
 * @description GET|POST /api/v1/auth/oauth/[provider]/callback
 *
 *   Google (GET):  code → token exchange (client secret) → userinfo
 *   Apple  (POST): form_post id_token, verified against Apple's JWKS
 *                  (signature, iss=https://appleid.apple.com, aud=APPLE_CLIENT_ID, exp)
 *
 * The state parameter must match the httpOnly state cookie set by the start
 * route. On success the user is signed in with HttpOnly cookies.
 *
 * @module apps/web/api/v1/auth/oauth
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { AuthService } from '@/domains/identity/AuthService'
import { AppError } from '@/lib/errors/AppError'
import { setAuthCookies } from '@/lib/cookies'
import { safeEqual } from '@/lib/env'
import { clientIp } from '@/lib/rate-limit'

const SUPPORTED_PROVIDERS = ['google', 'apple'] as const
type Provider = (typeof SUPPORTED_PROVIDERS)[number]

type OAuthIdentity = {
  providerId: string
  email: string
  fullName: string
  avatarUrl: string | null
  emailVerified: boolean
}

const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

function appUrl(): string {
  return process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
}

async function getGoogleUser(code: string, redirectUri: string): Promise<OAuthIdentity> {
  const clientId = process.env['GOOGLE_CLIENT_ID']
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']
  if (!clientId || !clientSecret) throw new AppError('Google sign-in is not configured', 'OAUTH_NOT_CONFIGURED', 503)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!tokenRes.ok) throw new AppError('Google sign-in failed', 'OAUTH_EXCHANGE_FAILED', 400)
  const tokens = (await tokenRes.json()) as { access_token: string }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!userRes.ok) throw new AppError('Google sign-in failed', 'OAUTH_EXCHANGE_FAILED', 400)
  const info = (await userRes.json()) as { sub: string; email: string; name?: string; picture?: string; email_verified?: boolean }

  return {
    providerId: info.sub,
    email: info.email,
    fullName: info.name ?? info.email.split('@')[0] ?? 'Zipgrid user',
    avatarUrl: info.picture ?? null,
    emailVerified: info.email_verified === true,
  }
}

async function getAppleUser(idToken: string, formName?: string): Promise<OAuthIdentity> {
  const clientId = process.env['APPLE_CLIENT_ID']
  if (!clientId) throw new AppError('Apple sign-in is not configured', 'OAUTH_NOT_CONFIGURED', 503)

  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: clientId,
  }).catch(() => {
    throw new AppError('Apple sign-in could not be verified', 'OAUTH_INVALID_TOKEN', 400)
  })
  const email = payload['email']
  if (typeof payload.sub !== 'string' || typeof email !== 'string') {
    throw new AppError('Apple did not share an email address', 'OAUTH_NO_EMAIL', 400)
  }
  const verified = payload['email_verified']
  return {
    providerId: payload.sub,
    email,
    fullName: formName ?? email.split('@')[0] ?? 'Apple user',
    avatarUrl: null,
    emailVerified: verified === true || verified === 'true',
  }
}

async function handleCallback(request: NextRequest, provider: Provider): Promise<NextResponse> {
  const fail = (code: string) => NextResponse.redirect(`${appUrl()}/login?error=${encodeURIComponent(code)}`)
  const redirectUri = `${appUrl()}/api/v1/auth/oauth/${provider}/callback`

  let code: string | null = null
  let state: string | null = null
  let idToken: string | null = null
  let appleName: string | undefined

  if (request.method === 'POST') {
    const form = await request.formData()
    code = form.get('code') as string | null
    state = form.get('state') as string | null
    idToken = form.get('id_token') as string | null
    const user = form.get('user') as string | null // Apple sends the name on first sign-in only
    if (user) {
      try {
        const u = JSON.parse(user) as { name?: { firstName?: string; lastName?: string } }
        const name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ')
        if (name) appleName = name.slice(0, 150)
      } catch { /* ignore malformed name */ }
    }
  } else {
    code = request.nextUrl.searchParams.get('code')
    state = request.nextUrl.searchParams.get('state')
  }

  const storedState = request.cookies.get(`__zg_oauth_state_${provider}`)?.value
  if (!storedState || !state || !safeEqual(storedState, state)) return fail('oauth_state_mismatch')

  try {
    const identity = provider === 'google'
      ? (code ? await getGoogleUser(code, redirectUri) : null)
      : (idToken ? await getAppleUser(idToken, appleName) : null)
    if (!identity) return fail('oauth_no_code')

    const tokens = await AuthService.oauthSignIn(
      { provider, ...identity },
      { ip: clientIp(request.headers), userAgent: request.headers.get('user-agent') },
    )
    // 303 turns Apple's POST into a GET on the dashboard.
    const response = NextResponse.redirect(`${appUrl()}/dashboard`, 303)
    setAuthCookies(response, tokens)
    response.cookies.set(`__zg_oauth_state_${provider}`, '', { path: '/api/v1/auth/oauth', maxAge: 0 })
    return response
  } catch (err) {
    if (err instanceof AppError) return fail(err.code.toLowerCase())
    console.error(`[oauth/${provider}/callback]`, err)
    return fail('oauth_error')
  }
}

async function route(request: NextRequest, params: Promise<{ provider: string }>): Promise<NextResponse> {
  const { provider } = await params
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return NextResponse.redirect(`${appUrl()}/login?error=unsupported_provider`)
  }
  return handleCallback(request, provider as Provider)
}

/** GET /api/v1/auth/oauth/[provider]/callback — Google sign-in callback (code exchange, then sign-in). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return route(request, params)
}

/** POST /api/v1/auth/oauth/[provider]/callback — Apple sign-in callback (form_post id_token verified against Apple's JWKS). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return route(request, params)
}
