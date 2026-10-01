/**
 * @file route.ts
 * @description GET /api/v1/admin/listings — listings moderation queue.
 *              PATCH /api/v1/admin/listings — approve, flag, deactivate a listing.
 *
 * Also GET /api/v1/admin/analytics — platform-wide KPI summary.
 *
 * @module apps/web/api/v1/admin/listings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

function requireAdmin(req: NextRequest) {
  return (req.headers.get('x-user-roles') ?? '').split(',').map((r) => r.trim()).includes('admin')
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)))
  const offset = (page - 1) * pageSize
  const status = searchParams.get('status') ?? ''
  const query = searchParams.get('q') ?? ''

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const conds: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (status) { conds.push(`cl.status = $${i++}`); vals.push(status) }
    if (query) { conds.push(`(cl.title ILIKE $${i} OR cl.city ILIKE $${i})`); vals.push(`%${query}%`); i++ }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const [countRes, listingsRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM charger_listings cl ${where}`, vals),
      db.execute(
        `SELECT cl.id, cl.title, cl.city, cl.status, cl.charger_level, cl.max_power_kw,
                cl.price_per_kwh_cents, cl.average_rating, cl.review_count,
                cl.total_bookings, cl.created_at,
                u.full_name AS host_name, u.email AS host_email
         FROM charger_listings cl
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         JOIN users u ON u.id = hp.user_id
         ${where}
         ORDER BY cl.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total
    return apiResponse(listingsRes.rows, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const PatchListingSchema = z.object({
  listingId: z.string().uuid(),
  action: z.enum(['approve', 'flag', 'deactivate', 'restore']),
  note: z.string().max(500).optional(),
})

export async function PATCH(request: NextRequest) {
  const adminUserId = request.headers.get('x-user-id')
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = PatchListingSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  const STATUS_MAP: Record<string, string> = {
    approve: 'active', flag: 'under_review', deactivate: 'deactivated', restore: 'active',
  }
  const newStatus = STATUS_MAP[parsed.data.action]!

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    await db.execute(
      `UPDATE charger_listings SET status = $2, updated_at = NOW() WHERE id = $1`,
      [parsed.data.listingId, newStatus],
    )

    await db.execute(
      `INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'LISTING_STATUS_CHANGED', 'listing', $2, $3)`,
      [adminUserId, parsed.data.listingId, JSON.stringify({ action: parsed.data.action, newStatus, note: parsed.data.note })],
    ).catch(() => {})

    return apiResponse({ updated: true, listingId: parsed.data.listingId, newStatus })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
