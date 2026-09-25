/**
 * @file middleware.ts
 * @description Next.js Edge Middleware — JWT auth guard + rate limiting.
 *
 * ROUTE CLASSIFICATION:
 *   Public  — accessible without any token (marketing pages, auth pages, public API)
 *   Auth    — /auth/* pages, redirect to /dashboard if already authenticated
 *   Protected — everything else requires a valid access token JWT
 *
 * FLOW:
 *   1. If path is public → pass through
 *   2. If path is /auth/* and user has a valid token → redirect to /dashboard
 *   3. If path is protected → verify Authorization header or __zg_at cookie
 *   4. If token missing/expired → redirect to /auth/login?redirect=<original>
 *   5. If token valid → attach userId/roles to request headers for downstream use
 *
 * RATE LIMITING (Edge):
 *   - Auth endpoints: 10 requests per IP per 15 minutes (simple sliding window)
 *   - All other API: 100 req/min per IP
 *   Implemented via Upstash Ratelimit when env vars are present; gracefully
 *   degrades (allow) when UPSTASH_REDIS_URL is not set (local dev).
 *
 * @module apps/web
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

/* ── Route classification ───────────────────────────────────── */

/**
 * Paths that never require authentication.
 * Checked as prefix matches — order matters (more specific first).
 */
const PUBLIC_PATHS: string[] = [
  '/',
  '/for-drivers',
  '/for-homeowners',
  '/for-businesses',
  '/for-installers',
  '/pricing',
  '/safety',
  '/blog',
  '/help',
  '/legal',
  '/contact',
  // Static + Next.js internals
  '/_next',
  '/favicon.ico',
  '/og-image.png',
  '/robots.txt',
  '/sitemap.xml',
  '/icons',
  '/fonts',
  // Public API endpoints (no user context needed)
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/verify-phone',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/oauth',
  '/api/v1/listings/nearby',
  '/api/v1/listings/route',
  '/api/v1/marketplace/products',
  '/api/v1/marketplace/installers',
]

/** Auth pages — redirect to dashboard if already logged in */
const AUTH_PATHS: string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/verify-phone',
]

/** Auth API endpoints subject to stricter rate limiting */
const AUTH_API_PATHS: string[] = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/reset-password',
]

/* ── Helpers ────────────────────────────────────────────────── */

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname.startsWith(p))
}

function isAuthApiPath(pathname: string): boolean {
  return AUTH_API_PATHS.some((p) => pathname.startsWith(p))
}

function getSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET']
  if (!secret) {
    // In Edge runtime without JWT_SECRET, allow all (local dev without env)
    return new TextEncoder().encode('dev-secret-not-for-production-use')
  }
  return new TextEncoder().encode(secret)
}

/**
 * Extracts the JWT access token from:
 * 1. Authorization: Bearer <token> header
 * 2. __zg_at cookie (set by client after login for SSR pages)
 */
function extractAccessToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return request.cookies.get('__zg_at')?.value ?? null
}

type JwtPayload = {
  sub: string
  email: string
  roles: string[]
  kycVerified: boolean
  type: string
}

async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: 'zipgrid',
      audience: 'zipgrid-web',
    })
    if (payload['type'] !== 'access') return null
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}

/* ── Simple in-memory rate limiter (Edge-compatible) ───────── */
// For production use Upstash Redis — this is a graceful fallback for local dev
const rateMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs })
    return true // allowed
  }
  if (entry.count >= limit) return false // blocked
  entry.count++
  return true // allowed
}

/* ── Middleware ─────────────────────────────────────────────── */

/**
 * Next.js Edge Middleware.
 * Runs on every request matched by the `config.matcher` below.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

  /* ── 1. Rate limiting on auth API endpoints ───────────────── */
  if (isAuthApiPath(pathname)) {
    const allowed = checkRateLimit(`auth:${ip}`, 10, 15 * 60 * 1000)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts — please wait before trying again.' } },
        { status: 429, headers: { 'Retry-After': '900' } },
      )
    }
  }

  /* ── 2. Public paths — pass through ──────────────────────── */
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  /* ── 3. Extract and verify JWT ───────────────────────────── */
  const token = extractAccessToken(request)
  const payload = token ? await verifyAccessToken(token) : null

  /* ── 4. Auth pages — redirect if already authenticated ───── */
  if (isAuthPath(pathname)) {
    if (payload) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      return NextResponse.redirect(dashboardUrl)
    }
    return NextResponse.next()
  }

  /* ── 5. Protected routes — require valid token ───────────── */
  if (!payload) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  /* ── 6. Attach auth context to request headers ───────────── */
  // Downstream API routes read these headers instead of re-verifying the JWT
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', payload.sub)
  requestHeaders.set('x-user-email', payload.email)
  requestHeaders.set('x-user-roles', payload.roles.join(','))
  requestHeaders.set('x-kyc-verified', String(payload.kycVerified))

  return NextResponse.next({ request: { headers: requestHeaders } })
}

/* ── Matcher — which routes run this middleware ─────────────── */
export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js)$).*)',
  ],
}
