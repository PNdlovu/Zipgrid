/**
 * @file ocpi.ts
 * @description OCPI partner authentication (`Authorization: Token <token>`).
 * A token is valid if it matches OCPI_PARTNER_TOKEN or an active partner's
 * token_b in ocpi_partners. There is no "allow all" mode.
 *
 * @module lib/ocpi
 */

import { type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { safeEqual } from '@/lib/env'

export async function verifyOcpiToken(request: NextRequest): Promise<boolean> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Token ')) return false
  const token = header.slice(6).trim()
  if (!token) return false

  const envToken = process.env['OCPI_PARTNER_TOKEN']
  if (envToken && safeEqual(token, envToken)) return true

  try {
    const db = await getDb()
    const res = await db.execute(
      `SELECT 1 FROM ocpi_partners WHERE token_b = $1 AND is_active = TRUE LIMIT 1`,
      [token],
    )
    return res.rows.length > 0
  } catch {
    return false
  }
}
