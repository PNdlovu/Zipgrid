/**
 * @file route.ts
 * @description PATCH /api/v1/fleet/policy — Fleet admin updates spend policy.
 *
 * @module apps/web/api/v1/fleet/policy
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, ForbiddenError } from '@/lib/errors/AppError'

const BodySchema = z.object({
  maxSpendPerSessionPence: z.number().int().positive().nullable().optional(),
  maxSpendPerMonthPence:   z.number().int().positive().nullable().optional(),
  allowedListingTypes:     z.array(z.string()).optional(),
  requiresApproval:        z.boolean().optional(),
})

/** PATCH /api/v1/fleet/policy — Fleet admin updates spend policy. */
export async function PATCH(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof BodySchema>
  try { body = BodySchema.parse(await request.json()) }
  catch { return apiError('VALIDATION_ERROR', 'Invalid policy fields', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const adminRes = await db.execute(
      `SELECT fm.fleet_account_id FROM fleet_members fm
       WHERE fm.user_id = $1 AND fm.role = 'fleet_admin' AND fm.status = 'active' LIMIT 1`,
      [userId],
    )
    if (adminRes.rows.length === 0) throw new ForbiddenError('Fleet admin access required')
    const fleetId = (adminRes.rows[0] as { fleet_account_id: string }).fleet_account_id

    const updates: string[] = []
    const params: unknown[] = [fleetId]

    if (body.maxSpendPerSessionPence !== undefined) {
      params.push(body.maxSpendPerSessionPence)
      updates.push(`max_spend_per_session_pence = $${params.length}`)
    }
    if (body.maxSpendPerMonthPence !== undefined) {
      params.push(body.maxSpendPerMonthPence)
      updates.push(`max_spend_per_month_pence = $${params.length}`)
    }
    if (body.allowedListingTypes !== undefined) {
      params.push(body.allowedListingTypes)
      updates.push(`allowed_listing_types = $${params.length}`)
    }
    if (body.requiresApproval !== undefined) {
      params.push(body.requiresApproval)
      updates.push(`requires_approval = $${params.length}`)
    }

    if (updates.length === 0) return apiResponse({ updated: false })

    await db.execute(
      `UPDATE fleet_accounts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1`,
      params,
    )

    return apiResponse({ updated: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[fleet/policy]', err)
    return apiError('INTERNAL_ERROR', 'Could not update policy', 500)
  }
}
