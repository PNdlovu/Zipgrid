/**
 * @file context.ts
 * @description Request context helpers for API routes.
 *
 * Identity comes from headers injected by middleware.ts after it verifies the
 * access token. Middleware strips any client-supplied x-user-* headers on
 * every request, so these values can be trusted inside route handlers.
 *
 * @module lib/api
 */

import { type NextRequest, type NextResponse } from 'next/server'
import { apiError, type ApiErrorResponse } from '@/lib/api/response'
import { AppError, ForbiddenError, UnauthorizedError } from '@/lib/errors/AppError'

export type RequestUser = {
  userId: string
  email: string
  roles: string[]
}

/** Returns the authenticated user, or null for anonymous requests. */
export function getRequestUser(request: NextRequest): RequestUser | null {
  const userId = request.headers.get('x-user-id')
  if (!userId) return null
  return {
    userId,
    email: request.headers.get('x-user-email') ?? '',
    roles: (request.headers.get('x-user-roles') ?? '').split(',').filter(Boolean),
  }
}

/** Returns the authenticated user or throws 401. */
export function requireUser(request: NextRequest): RequestUser {
  const user = getRequestUser(request)
  if (!user) throw new UnauthorizedError()
  return user
}

/** Returns the authenticated user when they hold one of `roles`, else throws. */
export function requireRole(request: NextRequest, ...roles: string[]): RequestUser {
  const user = requireUser(request)
  if (!roles.some((r) => user.roles.includes(r))) throw new ForbiddenError()
  return user
}

/** Maps any thrown value to an API error response; logs unexpected errors. */
export function errorResponse(err: unknown, label: string): NextResponse<ApiErrorResponse> {
  if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
  console.error(`[${label}]`, err)
  return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
}
