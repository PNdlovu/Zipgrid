/**
 * @file jwt.ts
 * @description JWT helpers — sign and verify access + refresh tokens using jose.
 * Access token: HS256, 15-minute expiry, stored in memory / Authorization header.
 * Refresh token: HS256, 7-day expiry (30 days if rememberMe), stored in HttpOnly cookie.
 *
 * @module apps/web/lib
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

/** JWT payload shape for access tokens */
export type AccessTokenPayload = {
  sub: string            // userId
  email: string
  roles: string[]
  kycVerified: boolean
  type: 'access'
}

/** JWT payload shape for refresh tokens */
export type RefreshTokenPayload = {
  sub: string            // userId
  sessionId: string
  type: 'refresh'
}

/** JWT payload shape for email/phone verification tokens */
export type VerifyTokenPayload = {
  sub: string            // userId
  email?: string
  phone?: string
  code: string
  type: 'verify_email' | 'verify_phone'
}

/** JWT payload shape for password reset tokens */
export type ResetTokenPayload = {
  sub: string            // userId
  email: string
  type: 'password_reset'
}

function getSecret(envVar: string): Uint8Array {
  const value = process.env[envVar]
  if (!value) throw new Error(`Missing environment variable: ${envVar}`)
  return new TextEncoder().encode(value)
}

/**
 * Issues a short-lived access JWT (15 minutes).
 */
export async function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'access' } satisfies AccessTokenPayload & JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('zipgrid')
    .setAudience('zipgrid-web')
    .sign(getSecret('JWT_SECRET'))
}

/**
 * Issues a refresh token (7 days default, 30 days if rememberMe).
 */
export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
  rememberMe = false,
): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' } satisfies RefreshTokenPayload & JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(rememberMe ? '30d' : '7d')
    .setIssuer('zipgrid')
    .setAudience('zipgrid-web')
    .sign(getSecret('JWT_SECRET'))
}

/**
 * Verifies and decodes an access token.
 * @throws if token is invalid, expired, or wrong type
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_SECRET'), {
    issuer: 'zipgrid',
    audience: 'zipgrid-web',
  })
  if (payload['type'] !== 'access') throw new Error('Not an access token')
  return payload as unknown as AccessTokenPayload
}

/**
 * Verifies and decodes a refresh token.
 * @throws if token is invalid, expired, or wrong type
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_SECRET'), {
    issuer: 'zipgrid',
    audience: 'zipgrid-web',
  })
  if (payload['type'] !== 'refresh') throw new Error('Not a refresh token')
  return payload as unknown as RefreshTokenPayload
}

/**
 * Issues a short-lived password reset token (30 minutes).
 */
export async function signResetToken(
  payload: Omit<ResetTokenPayload, 'type'>,
): Promise<string> {
  return new SignJWT({ ...payload, type: 'password_reset' } satisfies ResetTokenPayload & JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .setIssuer('zipgrid')
    .setAudience('zipgrid-web')
    .sign(getSecret('JWT_SECRET'))
}

/**
 * Verifies a password reset token.
 */
export async function verifyResetToken(token: string): Promise<ResetTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_SECRET'), {
    issuer: 'zipgrid',
    audience: 'zipgrid-web',
  })
  if (payload['type'] !== 'password_reset') throw new Error('Not a reset token')
  return payload as unknown as ResetTokenPayload
}

/** Cookie name for the refresh token */
export const REFRESH_TOKEN_COOKIE = '__zg_rt'

/** Access token header name */
export const ACCESS_TOKEN_HEADER = 'Authorization'
