/**
 * @file env.ts
 * @description Server-side environment helpers. Secrets never fall back to a
 * default value: a missing secret is a configuration error and fails closed.
 *
 * @module lib/env
 */

import { createHash, timingSafeEqual } from 'node:crypto'

/** Returns the variable's value or throws when it is unset/empty. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/** True when the variable is set to a non-empty value. */
export function hasEnv(name: string): boolean {
  return Boolean(process.env[name])
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Checks `Authorization: Bearer <secret>` (or a named header) against the
 * secret held in `envName`. Returns false — never throws — when the secret is
 * not configured, so unconfigured integrations stay closed.
 */
export function hasValidServiceSecret(
  headers: Headers,
  envName: string,
  headerName = 'authorization',
): boolean {
  const secret = process.env[envName]
  if (!secret) return false
  const raw = headers.get(headerName) ?? ''
  const presented = headerName === 'authorization' ? raw.replace(/^Bearer\s+/i, '') : raw
  return presented.length > 0 && safeEqual(presented, secret)
}
