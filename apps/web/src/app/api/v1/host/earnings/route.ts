/**
 * @file route.ts
 * @description GET /api/v1/host/earnings — host earnings summary.
 * Used by both the host earnings page and the ai-service get_earnings tool.
 *
 * Uses transactions.host_earnings_cents (authoritative) rather than
 * estimating 85% of total_cost_pence.
 *
 * @module apps/web/api/v1/host/earnings
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const PERIOD_DAYS: Record<string, number> = {
  today: 1,
  this_week: 7,
  this_month: 30,
  last_month: 60,
  all_time: 3650,
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const period = searchParams.get('period') ?? 'this_month'
  const days   = PERIOD_DAYS[period] ?? 30
  const since  = new Date(Date.now() - days * 86_400_000).toISOString()

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const hostRes = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)
    const hostProfileId = (hostRes.rows[0] as { id: string }).id

    // Use transactions.host_earnings_cents — the authoritative post-fee value
    const res = await db.execute(
      `SELECT
         COUNT(cs.id)::INT                               AS session_count,
         COALESCE(SUM(cs.total_cost_pence), 0)::INT      AS gross_earnings_pence,
         COALESCE(SUM(t.platform_fee_cents), 0)::INT     AS platform_fee_pence,
         COALESCE(SUM(t.host_earnings_cents), 0)::INT    AS net_earnings_pence,
         COALESCE(SUM(cs.energy_consumed_wh) / 1000.0, 0)::NUMERIC(10,2) AS total_kwh,
         ROUND(AVG(cs.total_cost_pence))::INT            AS avg_session_pence
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       LEFT JOIN transactions t ON t.booking_id = b.id AND t.status = 'captured'
       WHERE cl.host_profile_id = $1
         AND cs.status = 'completed'
         AND cs.started_at >= $2`,
      [hostProfileId, since],
    )

    const row = res.rows[0] as {
      session_count: number
      gross_earnings_pence: number
      platform_fee_pence: number
      net_earnings_pence: number
      total_kwh: string
      avg_session_pence: number | null
    }

    return apiResponse({
      period,
      sessionCount:       row.session_count,
      grossEarningsPence: row.gross_earnings_pence,
      platformFeePence:   row.platform_fee_pence,
      netEarningsPence:   row.net_earnings_pence,
      totalKwh:           Number(row.total_kwh),
      avgSessionPence:    row.avg_session_pence ?? 0,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
