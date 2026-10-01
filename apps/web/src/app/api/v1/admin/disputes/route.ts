/**
 * @file route.ts
 * @description GET /api/v1/admin/disputes — paginated dispute queue.
 *              PATCH /api/v1/admin/disputes — resolve/escalate a dispute.
 *
 * @module apps/web/api/v1/admin/disputes
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

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const conditions = status ? [`d.status = $1`] : []
    const values: unknown[] = status ? [status] : []
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    let i = values.length + 1

    const [countRes, disputesRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM disputes d ${where}`, values),
      db.execute(
        `SELECT d.id, d.status, d.dispute_type, d.created_at, d.resolution_notes,
                d.refund_amount_cents, d.booking_id,
                u_raiser.full_name AS raised_by_name, u_raiser.email AS raised_by_email,
                u_against.full_name AS raised_against_name,
                b.scheduled_start, cl.title AS listing_title
         FROM disputes d
         JOIN users u_raiser ON u_raiser.id = d.raised_by_user_id
         LEFT JOIN users u_against ON u_against.id = d.raised_against_user_id
         LEFT JOIN bookings b ON b.id = d.booking_id
         LEFT JOIN charger_listings cl ON cl.id = b.listing_id
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total
    return apiResponse(disputesRes.rows, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/admin/disputes]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const PatchDisputeSchema = z.object({
  disputeId: z.string().uuid(),
  action: z.enum(['resolve_driver', 'resolve_host', 'resolve_split', 'escalate', 'close']),
  resolutionNotes: z.string().max(2000).optional(),
  refundAmountPence: z.number().int().nonnegative().optional(),
})

export async function PATCH(request: NextRequest) {
  const adminUserId = request.headers.get('x-user-id')
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = PatchDisputeSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  const { disputeId, action, resolutionNotes, refundAmountPence } = parsed.data

  const STATUS_MAP: Record<string, string> = {
    resolve_driver: 'resolved_driver_favour',
    resolve_host: 'resolved_host_favour',
    resolve_split: 'resolved_split',
    escalate: 'escalated',
    close: 'closed',
  }
  const newStatus = STATUS_MAP[action]!

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    await db.execute(
      `UPDATE disputes
       SET status = $2, resolution_notes = $3, resolved_at = NOW(),
           resolved_by_user_id = $4, refund_amount_cents = COALESCE($5, refund_amount_cents),
           updated_at = NOW()
       WHERE id = $1`,
      [disputeId, newStatus, resolutionNotes ?? null, adminUserId, refundAmountPence ?? null],
    )

    await db.execute(
      `INSERT INTO audit_log (actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'DISPUTE_RESOLVED', 'dispute', $2, $3)`,
      [adminUserId, disputeId, JSON.stringify({ action, newStatus })],
    ).catch(() => {})

    return apiResponse({ updated: true, disputeId, newStatus })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[PATCH /api/v1/admin/disputes]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
