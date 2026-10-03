/**
 * @file middleware.ts
 * @description Authentication gateway for every request (Node.js runtime).
 *
 *   1. Strips client-supplied identity headers (x-user-*) — always.
 *   2. Resolves the user from `Authorization: Bearer` (mobile/API clients) or
 *      the HttpOnly __zg_at cookie (browsers). If the access token is missing
 *      or expired but a refresh cookie is present, the session is rotated
 *      transparently and new cookies are set on the response.
 *   3. Deny by default: anything not listed as public needs a user.
 *      API routes get 401/403 JSON; pages redirect to /login.
 *   4. Cookie-authenticated state-changing API calls must be same-origin (CSRF).
 *   5. Admin areas require the admin role.
 *
 * Downstream route handlers read x-user-id / x-user-roles / x-user-email,
 * which can therefore only have been set here.
 *
 * Webhooks, cron and partner endpoints are public here and authenticate
 * themselves (signatures / shared secrets).
 *
 * @module apps/web
 */

import { type NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, REFRESH_TOKEN_COOKIE, type AccessTokenPayload } from '@/lib/jwt'
import { rotateSession } from '@/lib/auth/sessions'
import { ACCESS_TOKEN_COOKIE, setAuthCookies } from '@/lib/cookies'
import { clientIp } from '@/lib/rate-limit'

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icons/|fonts/|images/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|woff2?)$).*)',
  ],
}

/* ── Route classification ───────────────────────────────────── */

const IDENTITY_HEADERS = ['x-user-id', 'x-user-email', 'x-user-roles', 'x-kyc-verified']

/** Public pages: exact paths and path prefixes. */
const PUBLIC_PAGES_EXACT = new Set(['/', '/help', '/pricing', '/safety', '/contact', '/map', '/marketplace', '/listings', '/verify-email'])
const PUBLIC_PAGE_PREFIXES = ['/for-', '/blog', '/legal', '/marketplace/', '/listings/']
/** Public-looking paths that still need a user. */
const PROTECTED_EXCEPTIONS = [/^\/listings\/[^/]+\/book$/]

const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password']

/** API routes open to anonymous callers (any method) — they self-authenticate if needed. */
const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/oauth/',
  '/api/v1/webhooks/stripe',
  '/api/v1/webhooks/ocpp',
  '/api/v1/cron/',
  '/api/cron/',
  '/api/v1/interop/',
  '/api/v1/grid/analytics',
  '/api/v1/voice/alexa',
  '/api/v1/voice/google-home',
]
/** API routes open to anonymous GETs (discovery); writes still need a user. */
const PUBLIC_GET_API_PREFIXES = [
  '/api/v1/listings',
  '/api/v1/marketplace/products',
  '/api/v1/marketplace/installers',
  '/api/v1/region/currency',
  '/api/v1/reviews',
  '/api/v1/white-label',
]
const PUBLIC_GET_API_EXCEPTIONS = ['/api/v1/listings/saved']

const ADMIN_PREFIXES = ['/admin', '/api/v1/admin/']

const matchesPrefix = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`) || (p.endsWith('/') && path.startsWith(p)))

function isPublic(path: string, method: string): boolean {
  if (path.startsWith('/api/')) {
    if (matchesPrefix(path, PUBLIC_API_PREFIXES)) return true
    if ((method === 'GET' || method === 'HEAD') && matchesPrefix(path, PUBLIC_GET_API_PREFIXES)) {
      return !PUBLIC_GET_API_EXCEPTIONS.some((p) => path === p || path.startsWith(`${p}/`))
    }
    return false
  }
  if (PROTECTED_EXCEPTIONS.some((re) => re.test(path))) return false
  if (PUBLIC_PAGES_EXACT.has(path)) return true
  return PUBLIC_PAGE_PREFIXES.some((p) => path.startsWith(p))
}

const isAuthPage = (path: string) => AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`))

/** Landing page for a signed-in user. Hosts land on /dashboard itself. */
function roleHome(roles: string[]): string {
  if (roles.includes('admin')) return '/admin/dashboard'
  if (roles.includes('host')) return '/dashboard'
  if (roles.includes('installer')) return '/marketplace'
  return '/map'
}

/* ── Identity resolution ────────────────────────────────────── */

type Resolved = {
  user: AccessTokenPayload | null
  viaCookie: boolean
  /** Fresh tokens to set on the response after a transparent refresh. */
  refreshed: { accessToken: string; refreshToken: string; rememberMe: boolean } | null
}

async function resolveUser(request: NextRequest): Promise<Resolved> {
  const header = request.headers.get('authorization')
  if (header?.startsWith('Bearer ')) {
    const user = await verifyAccessToken(header.slice(7)).catch(() => null)
    return { user, viaCookie: false, refreshed: null }
  }

  const cookieToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  if (cookieToken) {
    const user = await verifyAccessToken(cookieToken).catch(() => null)
    if (user) return { user, viaCookie: true, refreshed: null }
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  if (refreshToken) {
    const tokens = await rotateSession(refreshToken, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    }).catch((err: unknown) => {
      console.error('[middleware] session refresh failed', err)
      return null
    })
    if (tokens) {
      const user = await verifyAccessToken(tokens.accessToken)
      return { user, viaCookie: true, refreshed: tokens }
    }
  }
  return { user: null, viaCookie: Boolean(cookieToken || refreshToken), refreshed: null }
}

/** Same-origin check for cookie-authenticated writes. */
function isCrossSite(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false // non-browser client or same-origin navigation
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

function json(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

/* ── Middleware ─────────────────────────────────────────────── */

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const method = request.method
  const isApi = pathname.startsWith('/api/')

  if (!process.env['JWT_SECRET']) {
    console.error('[middleware] JWT_SECRET is not set — refusing to serve authenticated routes')
    if (!isPublic(pathname, method) || isAuthPage(pathname)) {
      return isApi ? json(503, 'MISCONFIGURED', 'Authentication is not configured') : new NextResponse('Service unavailable', { status: 503 })
    }
  }

  // 1. Never trust identity headers from the client.
  const requestHeaders = new Headers(request.headers)
  for (const h of IDENTITY_HEADERS) requestHeaders.delete(h)

  const publicRoute = isPublic(pathname, method)
  const { user, viaCookie, refreshed } = process.env['JWT_SECRET']
    ? await resolveUser(request)
    : { user: null, viaCookie: false, refreshed: null }

  const finish = (response: NextResponse): NextResponse => {
    if (refreshed) setAuthCookies(response, refreshed)
    return response
  }

  if (user) {
    requestHeaders.set('x-user-id', user.sub)
    requestHeaders.set('x-user-email', user.email)
    requestHeaders.set('x-user-roles', user.roles.join(','))
    requestHeaders.set('x-kyc-verified', String(user.kycVerified))
  }

  // 2. Auth pages: signed-in users go to their home.
  if (isAuthPage(pathname)) {
    if (user) return finish(NextResponse.redirect(new URL(roleHome(user.roles), request.url)))
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // 3. /dashboard routes each role to its home (hosts stay here).
  if (pathname === '/dashboard' && user && !user.roles.includes('host')) {
    return finish(NextResponse.redirect(new URL(roleHome(user.roles), request.url)))
  }

  // 4. Deny by default.
  if (!publicRoute && !user) {
    if (isApi) return json(401, 'UNAUTHORIZED', 'Authentication required')
    const login = new URL('/login', request.url)
    login.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`)
    const response = NextResponse.redirect(login)
    if (viaCookie) {
      // Stale cookies — clear them so the login page starts clean.
      response.cookies.set(ACCESS_TOKEN_COOKIE, '', { path: '/', maxAge: 0 })
      response.cookies.set(REFRESH_TOKEN_COOKIE, '', { path: '/', maxAge: 0 })
    }
    return response
  }

  // 5. Admin areas.
  if (ADMIN_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) {
    if (!user?.roles.includes('admin')) {
      return isApi ? json(403, 'FORBIDDEN', 'Admin access required') : finish(NextResponse.redirect(new URL('/', request.url)))
    }
  }

  // 6. CSRF: cookie-authenticated writes must come from our own origin.
  if (isApi && viaCookie && user && !['GET', 'HEAD', 'OPTIONS'].includes(method) && isCrossSite(request)) {
    return json(403, 'CSRF_REJECTED', 'Cross-site request rejected')
  }

  return finish(NextResponse.next({ request: { headers: requestHeaders } }))
}
