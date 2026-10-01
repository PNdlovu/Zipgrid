/**
 * @file route.ts
 * @description GET/PATCH/DELETE /api/v1/chargers/[chargerId]
 *
 * GET    — charger detail (owner only)
 * PATCH  — update brand/model/notes (owner only)
 * DELETE — unpair charger (owner only, only if no active sessions)
 *
 * @module apps/web/api/v1/chargers/[chargerId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { OcppService } from '@/domains/charging/OcppService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ chargerId: string }> }

const PatchSchema = z.object({
  brand:    z.string().min(1).max(80).optional(),
  model:    z.string().min(1).max(80).optional(),
  notes:    z.string().max(1000).optional(),
}).strict()

async function resolveOwnership(chargerId: string, userId: string) {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const res = await db.execute(
    `SELECT cd.id, cd.charge_point_id, cd.brand, cd.model,
            cd.current_status, cd.firmware_version, cd.last_heartbeat_at,
            cd.created_at, cd.updated_at
     FROM charger_devices cd
     JOIN host_profiles hp ON hp.id = cd.host_profile_id
     WHERE cd.id = $1 AND hp.user_id = $2
     LIMIT 1`,
    [chargerId, userId],
  )
  if (res.rows.length === 0) throw new NotFoundError('Charger', chargerId)
  return { db, row: res.rows[0] as Record<string, unknown> }
}

/** GET /api/v1/chargers/[chargerId] */
export async function GET(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { row } = await resolveOwnership(chargerId, userId)
    const connected = await OcppService.isConnected(row['charge_point_id'] as string).catch(() => false)

    return apiResponse({
      id:              row['id'],
      chargePointId:   row['charge_point_id'],
      brand:           row['brand'],
      model:           row['model'],
      isConnected:     connected,
      status:          connected ? (row['current_status'] as string || 'available') : 'offline',
      firmwareVersion: row['firmware_version'],
      lastHeartbeat:   row['last_heartbeat_at'],
      createdAt:       row['created_at'],
      updatedAt:       row['updated_at'],
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** PATCH /api/v1/chargers/[chargerId] */
export async function PATCH(request: NextRequest, { params }: Params) {
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

  const { chargerId } = await params
  try {
    const { db } = await resolveOwnership(chargerId, userId)

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1

    if (parsed.data.brand !== undefined) { sets.push(`brand = $${i++}`); vals.push(parsed.data.brand) }
    if (parsed.data.model !== undefined) { sets.push(`model = $${i++}`); vals.push(parsed.data.model) }
    if (parsed.data.notes !== undefined) { sets.push(`notes = $${i++}`); vals.push(parsed.data.notes) }

    if (sets.length === 0) {
      // Nothing changed
      return GET(request, { params })
    }

    sets.push(`updated_at = NOW()`)
    vals.push(chargerId)
    await db.execute(`UPDATE charger_devices SET ${sets.join(', ')} WHERE id = $${i}`, vals)

    return GET(request, { params })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** DELETE /api/v1/chargers/[chargerId] — unpair (only if no active sessions) */
export async function DELETE(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { db, row } = await resolveOwnership(chargerId, userId)

    // Block deletion if any active sessions
    const activeRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt
       FROM charging_sessions
       WHERE charge_point_id = $1
         AND status IN ('preparing','charging','paused','finishing')`,
      [row['charge_point_id']],
    )
    if ((activeRes.rows[0] as { cnt: number }).cnt > 0) {
      return apiError(
        'ACTIVE_SESSION',
        'Cannot unpair a charger with an active session. Stop the session first.',
        409,
      )
    }

    // Soft-delete
    await db.execute(
      `UPDATE charger_devices SET status = 'deactivated', updated_at = NOW() WHERE id = $1`,
      [chargerId],
    )

    return apiResponse({ unpaired: true, chargerId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
