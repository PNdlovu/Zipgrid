/**
 * @file route.ts
 * @description POST /api/v1/chargers/pair — register a new OCPP device.
 * Generates a unique API key, records the charger, and returns the
 * OCPP Central System URL for the host to enter in charger settings.
 *
 * @module apps/web/api/v1/chargers/pair
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const PairSchema = z.object({
  chargePointId: z.string().min(3).max(100).regex(/^[A-Za-z0-9_-]+$/),
  brand: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
})

/** POST /api/v1/chargers/pair */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = PairSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Check CP ID not already registered
    const existing = await db.execute(
      `SELECT id FROM charger_devices WHERE charge_point_id = $1 LIMIT 1`,
      [parsed.data.chargePointId],
    )
    if (existing.rows.length > 0) {
      return apiError('CONFLICT', 'This Charge Point ID is already registered', 409)
    }

    // Look up host profile
    const hostResult = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostResult.rows.length === 0) {
      return apiError('HOST_PROFILE_NOT_FOUND', 'Complete your host profile first', 400)
    }
    const hostProfileId = (hostResult.rows[0] as { id: string }).id

    const chargerId = uuidv4()
    // Generate a 32-byte random API key and store only the SHA-256 hash.
    // The plain-text key is returned ONCE to the host — it cannot be recovered.
    const rawApiKey = Array.from(
      crypto.getRandomValues(new Uint8Array(24)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')  // 48-char hex key

    const keyBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(rawApiKey),
    )
    const apiKeyHash = Array.from(new Uint8Array(keyBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const ocppBaseUrl = process.env['OCPP_CENTRAL_SYSTEM_URL'] ?? 'wss://ocpp.zipgrid.co.uk'
    const ocppUrl = `${ocppBaseUrl}/1.6/${parsed.data.chargePointId}`

    await db.execute(
      `INSERT INTO charger_devices
         (id, host_profile_id, charge_point_id, brand, model, api_key_hash, ocpp_url, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())`,
      [chargerId, hostProfileId, parsed.data.chargePointId, parsed.data.brand, parsed.data.model, apiKeyHash, ocppUrl],
    )

    return apiResponse({
      chargerId,
      chargePointId: parsed.data.chargePointId,
      ocppUrl,
      // Plain-text key shown ONCE — not stored. Host must save this immediately.
      apiKey: rawApiKey,
      apiKeyNote: 'Save this key now — it cannot be shown again.',
    }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/chargers/pair]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
