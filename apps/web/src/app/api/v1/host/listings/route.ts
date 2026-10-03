/**
 * @file route.ts
 * @description GET /api/v1/host/listings — listings owned by the authenticated host.
 * Returns all listings for the host's profile with stats (session count, revenue,
 * average rating). Used by the host portal listings management page.
 *
 * Query params:
 *   status  — filter by listing status (active | draft | paused | under_review)
 *   page    — page number (default 1)
 *   pageSize — results per page (default 50, max 100)
 *
 * @module apps/web/api/v1/host/listings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const statusFilter = searchParams.get('status') ?? null
  const page     = Math.max(1, parseInt(searchParams.get('page')     ?? '1',  10))
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') ?? '50', 10))
  const offset   = (page - 1) * pageSize

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Resolve host profile
    const hostRes = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) {
      return apiError('FORBIDDEN', 'Host profile not found', 403)
    }
    const hostProfileId = (hostRes.rows[0] as { id: string }).id

    // Build optional status clause
    const params: unknown[] = [hostProfileId]
    let statusClause = ''
    if (statusFilter) {
      params.push(statusFilter)
      statusClause = `AND cl.status = $${params.length}`
    }

    const [countRes, listRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total
         FROM charger_listings cl
         WHERE cl.host_profile_id = $1 ${statusClause}`,
        params,
      ),
      db.execute(
        `SELECT
           cl.id,
           cl.title,
           cl.city,
           cl.postal_code AS postcode,
           cl.status,
           cl.charger_level,
           cl.max_power_kw,
           cl.price_per_kwh_cents  AS price_per_kwh_pence,
           cl.pricing_model,
           cl.instant_book_enabled,
           cl.average_rating,
           cl.review_count,
           cl.created_at,
           cl.updated_at,
           -- Stats from completed sessions
           COUNT(DISTINCT cs.id)::INT                        AS total_sessions,
           COALESCE(SUM(cs.total_session_cost_cents), 0)::INT        AS gross_revenue_pence,
           COALESCE(SUM(cs.energy_consumed_wh) / 1000.0, 0) AS total_kwh_delivered,
           -- Upcoming confirmed bookings
           COUNT(DISTINCT b_upcoming.id)::INT                AS upcoming_bookings
         FROM charger_listings cl
         LEFT JOIN bookings b ON b.listing_id = cl.id
         LEFT JOIN charging_sessions cs ON cs.booking_id = b.id AND cs.status = 'completed'
         LEFT JOIN bookings b_upcoming
           ON b_upcoming.listing_id = cl.id
           AND b_upcoming.status IN ('confirmed', 'active')
           AND b_upcoming.scheduled_start > NOW()
         WHERE cl.host_profile_id = $1 ${statusClause}
         GROUP BY cl.id
         ORDER BY cl.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total

    return apiResponse(
      listRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          id:                  row['id'],
          title:               row['title'],
          city:                row['city'],
          postcode:            row['postcode'],
          status:              row['status'],
          chargerLevel:        row['charger_level'],
          maxPowerKw:          Number(row['max_power_kw']),
          pricePerKwhPence:    row['price_per_kwh_pence'] != null
                                 ? Number(row['price_per_kwh_pence'])
                                 : null,
          pricingModel:        row['pricing_model'],
          instantBookEnabled:  Boolean(row['instant_book_enabled']),
          averageRating:       row['average_rating'] != null
                                 ? Number(row['average_rating'])
                                 : null,
          reviewCount:         Number(row['review_count'] ?? 0),
          totalSessions:       Number(row['total_sessions'] ?? 0),
          grossRevenuePence:   Number(row['gross_revenue_pence'] ?? 0),
          totalKwhDelivered:   Number(Number(row['total_kwh_delivered'] ?? 0).toFixed(2)),
          upcomingBookings:    Number(row['upcoming_bookings'] ?? 0),
          createdAt:           row['created_at'],
          updatedAt:           row['updated_at'],
        }
      }),
      { page, pageSize, total },
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/host/listings]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
