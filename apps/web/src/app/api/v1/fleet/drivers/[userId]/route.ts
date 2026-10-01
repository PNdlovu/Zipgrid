/**
 * @file route.ts
 * @description DELETE /api/v1/fleet/drivers/[userId]
 * Fleet admin removes a driver from the fleet account.
 *
 * @module apps/web/api/v1/fleet/drivers/[userId]
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, ForbiddenError, NotFoundError } from '@/lib/errors/AppError'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const adminUserId = request.headers.get('x-user-id')
  if (!adminUserId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { userId: targetUserId } = await params

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify admin
    const adminRes = await db.execute(
      `SELECT fm.fleet_account_id FROM fleet_members fm
       WHERE fm.user_id = $1 AND fm.role = 'fleet_admin' AND fm.status = 'active' LIMIT 1`,
      [adminUserId],
    )
    if (adminRes.rows.length === 0) throw new ForbiddenError('Fleet admin access required')
    const fleetId = (adminRes.rows[0] as { fleet_account_id: string }).fleet_account_id

    // Check target is in this fleet
    const memberRes = await db.execute(
      `SELECT id FROM fleet_members WHERE fleet_account_id = $1 AND user_id = $2 LIMIT 1`,
      [fleetId, targetUserId],
    )
    if (memberRes.rows.length === 0) throw new NotFoundError('Fleet member', targetUserId)

    // Prevent admin from removing themselves
    if (targetUserId === adminUserId) {
      return apiError('VALIDATION_ERROR', 'You cannot remove yourself from the fleet', 400)
    }

    await db.execute(
      `UPDATE fleet_members SET status = 'removed', updated_at = NOW()
       WHERE fleet_account_id = $1 AND user_id = $2`,
      [fleetId, targetUserId],
    )

    return apiResponse({ removed: true, userId: targetUserId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[fleet/drivers/remove]', err)
    return apiError('INTERNAL_ERROR', 'Could not remove driver', 500)
  }
}
