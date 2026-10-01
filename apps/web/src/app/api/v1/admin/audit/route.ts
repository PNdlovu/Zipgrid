/**
 * @file route.ts
 * @description GET /api/v1/admin/audit — paginated audit log for admin portal.
 * Supports search (by actor email) and filter by action type.
 *
 * @module apps/web/api/v1/admin/audit
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

function requireAdmin(req: NextRequest) {
  return (req.headers.get('x-user-roles') ?? '').split(',').map((r) => r.trim()).includes('admin')
}

/**
 * GET /api/v1/admin/audit
 * Returns paginated audit_log rows with actor email denormalised.
 */
export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  const { searchParams } = request.nextUrl
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)))
  const offset   = (page - 1) * pageSize
  const search   = searchParams.get('search')?.trim() ?? ''
  const action   = searchParams.get('action')?.trim() ?? ''

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const params: unknown[] = []
    const conditions: string[] = []
    let i = 1

    if (search) {
      params.push(`%${search}%`)
      conditions.push(`u.email ILIKE $${i++}`)
    }
    if (action) {
      params.push(action)
      conditions.push(`al.action = $${i++}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [countRes, rowsRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.actor_id
         ${where}`,
        params,
      ),
      db.execute(
        `SELECT al.id, al.actor_id, u.email AS actor_email,
                al.action, al.resource_type, al.resource_id,
                al.metadata, al.ip_address, al.created_at
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.actor_id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        [...params, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total
    const rows = rowsRes.rows.map((r) => {
      const row = r as Record<string, unknown>
      return {
        id:           row['id'],
        actorId:      row['actor_id'],
        actorEmail:   row['actor_email'],
        action:       row['action'],
        resourceType: row['resource_type'],
        resourceId:   row['resource_id'],
        metadata:     row['metadata'],
        ipAddress:    row['ip_address'],
        createdAt:    row['created_at'],
      }
    })

    return apiResponse({ rows, total }, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/admin/audit]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
