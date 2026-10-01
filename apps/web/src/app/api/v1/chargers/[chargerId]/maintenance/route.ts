/**
 * @file route.ts
 * @description GET/POST /api/v1/chargers/[chargerId]/maintenance
 *
 * GET  — list maintenance log entries for a charger (owner only)
 * POST — add a new maintenance note (owner only)
 *
 * Maintenance notes are stored in `charger_maintenance_log` and are
 * used by the host charger detail page to record inspections, repairs, etc.
 *
 * @module apps/web/api/v1/chargers/[chargerId]/maintenance
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ chargerId: string }> }

const ALLOWED_TYPES = ['inspection', 'repair', 'firmware', 'other'] as const
type MaintenanceType = (typeof ALLOWED_TYPES)[number]

const AddNoteSchema = z.object({
  note: z.string().min(1, 'Note is required').max(1000),
  type: z.enum(ALLOWED_TYPES).default('other'),
})

/** Verifies the charger belongs to the requesting user and returns its DB row. */
async function resolveChargerOwner(chargerId: string, userId: string) {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const res = await db.execute(
    `SELECT cd.id, cd.charge_point_id
     FROM charger_devices cd
     JOIN host_profiles hp ON hp.id = cd.host_profile_id
     WHERE cd.id = $1 AND hp.user_id = $2
     LIMIT 1`,
    [chargerId, userId],
  )
  return { db, found: res.rows.length > 0 }
}

/**
 * GET /api/v1/chargers/[chargerId]/maintenance
 * Returns the maintenance log for the charger, newest first.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  try {
    const { db, found } = await resolveChargerOwner(chargerId, userId)
    if (!found) return apiError('NOT_FOUND', 'Charger not found', 404)

    const { searchParams } = request.nextUrl
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))

    const result = await db.execute(
      `SELECT id, note, type, created_at
       FROM charger_maintenance_log
       WHERE charger_device_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [chargerId, limit],
    )

    const entries = result.rows.map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: row['id'] as string,
        note: row['note'] as string,
        type: row['type'] as MaintenanceType,
        createdAt: row['created_at'] as string,
      }
    })

    return apiResponse(entries)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/chargers/[id]/maintenance]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/**
 * POST /api/v1/chargers/[chargerId]/maintenance
 * Adds a new maintenance log entry.
 *
 * Body: { note: string, type?: 'inspection' | 'repair' | 'firmware' | 'other' }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = AddNoteSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const { chargerId } = await params
  try {
    const { db, found } = await resolveChargerOwner(chargerId, userId)
    if (!found) return apiError('NOT_FOUND', 'Charger not found', 404)

    const id = uuidv4()
    await db.execute(
      `INSERT INTO charger_maintenance_log
         (id, charger_device_id, note, type, created_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, chargerId, parsed.data.note, parsed.data.type, userId],
    )

    return apiResponse(
      {
        id,
        note: parsed.data.note,
        type: parsed.data.type,
        createdAt: new Date().toISOString(),
      },
      undefined,
      201,
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/chargers/[id]/maintenance]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
