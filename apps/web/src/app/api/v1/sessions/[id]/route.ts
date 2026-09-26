/**
 * @file route.ts
 * @description GET /api/v1/sessions/[id] — session detail with live state.
 *
 * @module apps/web/api/v1/sessions/[id]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

/** GET /api/v1/sessions/[id] */
export async function GET(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const result = await db.execute(
      `SELECT cs.id, cs.status, cs.energy_consumed_wh, cs.total_cost_pence,
              cs.price_per_kwh_cents, cs.power_w, cs.soc_percent,
              cs.started_at, cs.ended_at, cs.charge_point_id,
              cl.title AS listing_title, cl.city,
              u.display_name AS host_name
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       JOIN users u ON u.id = hp.user_id
       WHERE cs.id = $1
         AND (b.driver_id = (SELECT id FROM driver_profiles WHERE user_id = $2)
              OR hp.user_id = $2)
       LIMIT 1`,
      [id, userId],
    )

    if (result.rows.length === 0) throw new NotFoundError('Session', id)

    const row = result.rows[0] as Record<string, unknown>
    return apiResponse({
      id: row['id'],
      status: row['status'],
      energyConsumedWh: Number(row['energy_consumed_wh'] ?? 0),
      totalCostPence: Number(row['total_cost_pence'] ?? 0),
      pricePerKwhPence: Number(row['price_per_kwh_cents'] ?? 0),
      powerW: row['power_w'] != null ? Number(row['power_w']) : null,
      socPercent: row['soc_percent'] != null ? Number(row['soc_percent']) : null,
      startedAt: row['started_at'],
      listingTitle: row['listing_title'],
      listingCity: row['city'],
      hostName: row['host_name'],
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
