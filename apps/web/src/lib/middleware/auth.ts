/**
 * @file auth.ts
 * @description JWT authentication middleware for API routes.
 * Every protected API route wraps its handler with withAuth().
 * Validates HS256 JWT from Authorization: Bearer header.
 * @module lib/middleware
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { UnauthorizedError } from '@/lib/errors/AppError'

/** Decoded JWT payload attached to authenticated requests */
export type AuthUser = {
  userId: string
  email: string
  roles: Array<'driver' | 'host' | 'installer' | 'admin'>
  kycVerified: boolean
}

/**
 * Validates the JWT from the Authorization header.
 * @param request - Incoming Next.js request
 * @throws {UnauthorizedError} when token is missing or invalid
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header')
  }

  const token = authorization.slice(7)
  if (!process.env['JWT_SECRET']) {
    throw new Error('JWT_SECRET environment variable is required')
  }

  const secret = new TextEncoder().encode(process.env['JWT_SECRET'])

  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as AuthUser
  } catch {
    throw new UnauthorizedError('Invalid or expired token')
  }
}
