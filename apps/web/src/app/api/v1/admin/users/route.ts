/**
 * @file route.ts
 * @description GET /api/v1/admin/users — paginated user list with KYC status.
 *              PATCH /api/v1/admin/users — update user status (suspend/activate/assign role).
 *
 * Admin-only endpoint: requires x-user-roles to contain 'admin'.
 *
 * @module apps/web/api/v1/admin/users
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { AuditLogger } from '@/domains/compliance/AuditLogger'

function requireAdmin(request: NextRequest): boolean {
  const roles = request.headers.get('x-user-roles') ?? ''
  return roles.split(',').map((r) => r.trim()).includes('admin')
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)))
  const offset = (page - 1) * pageSize
  const query = searchParams.get('q') ?? ''
  const kycStatus = searchParams.get('kyc') ?? ''
  const accountStatus = searchParams.get('status') ?? ''

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const conditions: string[] = []
    const values: unknown[] = []
    let i = 1

    if (query) {
      conditions.push(`(u.email ILIKE $${i} OR u.full_name ILIKE $${i})`)
      values.push(`%${query}%`); i++
    }
    if (kycStatus) { conditions.push(`u.kyc_status = $${i++}`); values.push(kycStatus) }
    if (accountStatus) { conditions.push(`u.account_status = $${i++}`); values.push(accountStatus) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRes, usersRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM users u ${where}`, values),
      db.execute(
        `SELECT u.id, u.email, u.full_name, u.roles, u.account_status,
                u.kyc_status, u.kyc_verified_at, u.created_at,
                u.stripe_customer_id IS NOT NULL AS has_stripe,
                (SELECT COUNT(*)::INT FROM bookings b
                 JOIN driver_profiles dp ON dp.id = b.driver_profile_id
                 WHERE dp.user_id = u.id) AS booking_count
         FROM users u ${where}
         ORDER BY u.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total
    return apiResponse(usersRes.rows, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/admin/users]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const PatchUserSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['suspend', 'activate', 'verify_kyc', 'reject_kyc', 'add_role', 'remove_role']),
  role: z.enum(['driver', 'host', 'admin']).optional(),
  note: z.string().max(500).optional(),
})

export async function PATCH(request: NextRequest) {
  const adminUserId = request.headers.get('x-user-id')
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = PatchUserSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  const { userId, action, role } = parsed.data

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    switch (action) {
      case 'suspend':
        await db.execute(
          `UPDATE users SET account_status = 'suspended', updated_at = NOW() WHERE id = $1`,
          [userId],
        )
        break
      case 'activate':
        await db.execute(
          `UPDATE users SET account_status = 'active', updated_at = NOW() WHERE id = $1`,
          [userId],
        )
        break
      case 'verify_kyc':
        await db.execute(
          `UPDATE users SET kyc_status = 'verified', kyc_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [userId],
        )
        break
      case 'reject_kyc':
        await db.execute(
          `UPDATE users SET kyc_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [userId],
        )
        break
      case 'add_role':
        if (!role) return apiError('VALIDATION_ERROR', 'role required for add_role', 422)
        await db.execute(
          `UPDATE users SET roles = array_append(roles, $2::user_role), updated_at = NOW()
           WHERE id = $1 AND NOT (roles @> ARRAY[$2::user_role])`,
          [userId, role],
        )
        break
      case 'remove_role':
        if (!role) return apiError('VALIDATION_ERROR', 'role required for remove_role', 422)
        await db.execute(
          `UPDATE users SET roles = array_remove(roles, $2::user_role), updated_at = NOW() WHERE id = $1`,
          [userId, role],
        )
        break
    }

    // Write audit log
    await AuditLogger.logAsync({
      eventType: `admin.user_${action}`,
      actorId: adminUserId ?? undefined,
      targetId: userId,
      targetType: 'user',
      metadata: { action, role: role ?? null, note: parsed.data.note ?? null },
    })

    return apiResponse({ updated: true, userId, action })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[PATCH /api/v1/admin/users]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
