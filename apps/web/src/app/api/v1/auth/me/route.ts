/**
 * @file route.ts
 * @description GET/PATCH /api/v1/auth/me — current authenticated user profile.
 *
 * GET  — returns full user record (no password hash)
 * PATCH — updates displayName, avatarUrl, aiMode
 *
 * @module apps/web/api/v1/auth/me
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const PatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  avatarUrl:   z.string().url().max(512).optional(),
  aiMode:      z.enum(['standard', 'hybrid', 'agentic']).optional(),
  phoneNumber: z.string().max(20).optional(),
})

/** GET /api/v1/auth/me */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `SELECT id, email, display_name, full_name, avatar_url,
              phone AS phone_number, phone_verified, email_verified,
              kyc_status, kyc_verified_at, roles, ai_mode, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (res.rows.length === 0) return apiError('NOT_FOUND', 'User not found', 404)

    const u = res.rows[0] as Record<string, unknown>
    return apiResponse({
      id:            u['id'],
      email:         u['email'],
      displayName:   u['display_name'] ?? u['full_name'],
      avatarUrl:     u['avatar_url'],
      phoneNumber:   u['phone_number'],
      phoneVerified: Boolean(u['phone_verified']),
      emailVerified: Boolean(u['email_verified']),
      kycStatus:     u['kyc_status'],
      kycVerifiedAt: u['kyc_verified_at'],
      roles:         u['roles'],
      aiMode:        u['ai_mode'],
      createdAt:     u['created_at'],
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** PATCH /api/v1/auth/me */
export async function PATCH(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const sets: string[] = []
    const values: unknown[] = []
    let i = 1

    if (parsed.data.displayName !== undefined) {
      sets.push(`display_name = $${i++}`, `full_name = $${i++}`)
      values.push(parsed.data.displayName, parsed.data.displayName)
    }
    if (parsed.data.avatarUrl !== undefined) {
      sets.push(`avatar_url = $${i++}`)
      values.push(parsed.data.avatarUrl)
    }
    if (parsed.data.aiMode !== undefined) {
      sets.push(`ai_mode = $${i++}`)
      values.push(parsed.data.aiMode)
    }
    if (parsed.data.phoneNumber !== undefined) {
      sets.push(`phone = $${i++}`, `phone_verified = false`)
      values.push(parsed.data.phoneNumber)
    }

    if (sets.length === 0) {
      // Nothing to update — return current profile
      return GET(request)
    }

    sets.push(`updated_at = NOW()`)
    values.push(userId)

    await db.execute(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`,
      values,
    )

    return GET(request)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
