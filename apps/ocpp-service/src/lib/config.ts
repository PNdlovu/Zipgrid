/**
 * @file config.ts
 * @description OCPP service configuration. Required secrets are validated at
 * startup so a misconfigured deployment fails immediately instead of running
 * with an insecure default.
 *
 * @module apps/ocpp-service/lib
 */

import { createHash, timingSafeEqual } from 'crypto'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  /** Railway injects PORT; OCPP_PORT kept for local compatibility. */
  port: Number(process.env['PORT'] ?? process.env['OCPP_PORT'] ?? 3001),
  /** Shared secret for web ⇄ OCPP service calls. */
  get serviceSecret(): string {
    return required('OCPP_SERVICE_SECRET')
  },
  /** Base URL of the web platform, e.g. https://zipgrid.co.uk */
  webApiUrl: process.env['WEB_API_URL'] ?? null,
}

/** Throws at boot if a required variable is missing. */
export function assertConfig(): void {
  required('OCPP_SERVICE_SECRET')
  required('DATABASE_URL')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
