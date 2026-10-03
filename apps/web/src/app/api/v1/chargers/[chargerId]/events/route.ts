/**
 * @file route.ts
 * @description GET /api/v1/chargers/[chargerId]/events
 * Returns the OCPP event log for a specific charger (by listing ID).
 * Accessible by the listing owner or an admin.
 *
 * Query params:
 *   limit    — max rows (default 50, max 200)
 *   type     — filter by event_type (e.g. 'Faulted', 'StatusNotification')
 *   since    — ISO timestamp — events after this time only
 *
 * @module apps/web/api/v1/chargers/[chargerId]/events
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chargerId: string }> },
) {
  const userId = request.headers.get('x-user-id')
  const roles  = (request.headers.get('x-user-roles') ?? '').split(',')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { chargerId } = await params
  const { searchParams } = request.nextUrl
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const eventType = searchParams.get('type') ?? undefined
  const since     = searchParams.get('since') ?? undefined

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership or admin
    const isAdmin = roles.includes('admin')
    if (!isAdmin) {
      const ownerRes = await db.execute(
        `SELECT cl.id
         FROM charger_listings cl
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         WHERE cl.id = $1 AND hp.user_id = $2
         LIMIT 1`,
        [chargerId, userId],
      )
      if (ownerRes.rows.length === 0) {
        return apiError('FORBIDDEN', 'You do not own this charger', 403)
      }
    }

    // Look up OCPP CP ID for this listing
    const cpRes = await db.execute(
      `SELECT ocpp_charge_point_id FROM charger_listings WHERE id = $1 LIMIT 1`,
      [chargerId],
    )
    if (cpRes.rows.length === 0) return apiError('NOT_FOUND', 'Charger not found', 404)

    const ocppId = (cpRes.rows[0] as { ocpp_charge_point_id: string | null }).ocpp_charge_point_id
    if (!ocppId) return apiResponse({ events: [], total: 0, note: 'Non-networked charger — no OCPP event log.' })

    // Build query
    const conditions: string[] = ['oel.charge_point_id = $1']
    const qParams: unknown[] = [ocppId]

    if (eventType) {
      qParams.push(eventType)
      conditions.push(`oel.event_type = $${qParams.length}`)
    }
    if (since) {
      qParams.push(since)
      conditions.push(`oel.timestamp >= $${qParams.length}`)
    }

    qParams.push(limit)
    const eventsRes = await db.execute(
      `SELECT
         oel.id, oel.charge_point_id, oel.connector_id, oel.event_type,
         oel.error_code, oel.payload->>'info' AS info, oel.payload->>'status' AS status,
         oel.payload->>'vendorId' AS vendor_id, oel.payload->>'vendorErrorCode' AS vendor_error_code,
         oel.resolved, oel.timestamp
       FROM ocpp_event_log oel
       WHERE ${conditions.join(' AND ')}
       ORDER BY oel.timestamp DESC
       LIMIT $${qParams.length}`,
      qParams,
    )

    // Count
    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total FROM ocpp_event_log WHERE charge_point_id = $1`,
      [ocppId],
    )
    const total = (countRes.rows[0] as { total: number }).total

    return apiResponse({ events: eventsRes.rows, total, chargePointId: ocppId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[chargers/events]', err)
    return apiError('INTERNAL_ERROR', 'Could not fetch event log', 500)
  }
}
