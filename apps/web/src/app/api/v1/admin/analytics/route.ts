/**
 * @file route.ts
 * @description GET /api/v1/admin/analytics — platform-wide KPIs.
 * Returns GMV, MAU, session counts, revenue, user growth, and listing health.
 *
 * @module apps/web/api/v1/admin/analytics
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

function requireAdmin(req: NextRequest) {
  return (req.headers.get('x-user-roles') ?? '').split(',').map((r) => r.trim()).includes('admin')
}

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  const days = Math.min(365, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10)))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const prevSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString()

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const [
      gmvRes, prevGmvRes,
      sessionsRes, prevSessionsRes,
      usersRes, activeListingsRes,
      disputesRes, dailyGmvRes,
    ] = await Promise.all([
      // Current period GMV
      db.execute(
        `SELECT COALESCE(SUM(total_cost_pence), 0)::BIGINT AS gmv_pence,
                COALESCE(SUM(total_cost_pence * 0.15), 0)::BIGINT AS platform_revenue_pence,
                COUNT(*)::INT AS session_count
         FROM charging_sessions WHERE status = 'completed' AND started_at >= $1`,
        [since],
      ),
      // Previous period GMV (for delta)
      db.execute(
        `SELECT COALESCE(SUM(total_cost_pence), 0)::BIGINT AS gmv_pence
         FROM charging_sessions WHERE status = 'completed' AND started_at >= $1 AND started_at < $2`,
        [prevSince, since],
      ),
      // Session breakdown
      db.execute(
        `SELECT COUNT(*)::INT AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed,
                COUNT(*) FILTER (WHERE status = 'faulted')::INT AS faulted
         FROM charging_sessions WHERE created_at >= $1`,
        [since],
      ),
      // Previous period sessions
      db.execute(
        `SELECT COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed
         FROM charging_sessions WHERE created_at >= $1 AND created_at < $2`,
        [prevSince, since],
      ),
      // User stats
      db.execute(
        `SELECT COUNT(*)::INT AS total_users,
                COUNT(*) FILTER (WHERE created_at >= $1)::INT AS new_users,
                COUNT(DISTINCT dp.user_id) FILTER (
                  WHERE b.created_at >= $1
                )::INT AS mau
         FROM users u
         LEFT JOIN driver_profiles dp ON dp.user_id = u.id
         LEFT JOIN bookings b ON b.driver_profile_id = dp.id`,
        [since],
      ),
      // Active listings
      db.execute(
        `SELECT COUNT(*) FILTER (WHERE status = 'active')::INT AS active,
                COUNT(*) FILTER (WHERE status = 'under_review')::INT AS under_review,
                COUNT(*) FILTER (WHERE status = 'draft')::INT AS draft
         FROM charger_listings`,
        [],
      ),
      // Open disputes
      db.execute(
        `SELECT COUNT(*)::INT AS open_disputes
         FROM disputes WHERE status NOT IN ('closed','resolved_driver_favour','resolved_host_favour','resolved_split')`,
        [],
      ),
      // Daily GMV for chart
      db.execute(
        `SELECT DATE(started_at)::TEXT AS date,
                COUNT(*)::INT AS sessions,
                COALESCE(SUM(total_cost_pence), 0)::BIGINT AS gmv_pence
         FROM charging_sessions WHERE status = 'completed' AND started_at >= $1
         GROUP BY DATE(started_at) ORDER BY date ASC`,
        [since],
      ),
    ])

    const gmv = gmvRes.rows[0] as { gmv_pence: number; platform_revenue_pence: number; session_count: number }
    const prevGmv = prevGmvRes.rows[0] as { gmv_pence: number }
    const sessions = sessionsRes.rows[0] as { total: number; completed: number; faulted: number }
    const prevSessions = prevSessionsRes.rows[0] as { completed: number }
    const users = usersRes.rows[0] as { total_users: number; new_users: number; mau: number }
    const listings = activeListingsRes.rows[0] as { active: number; under_review: number; draft: number }
    const disputes = disputesRes.rows[0] as { open_disputes: number }

    const gmvDelta = prevGmv.gmv_pence > 0
      ? Math.round(((gmv.gmv_pence - prevGmv.gmv_pence) / prevGmv.gmv_pence) * 100)
      : 0
    const sessionDelta = prevSessions.completed > 0
      ? Math.round(((sessions.completed - prevSessions.completed) / prevSessions.completed) * 100)
      : 0

    return apiResponse({
      period: { days, since },
      gmv: {
        totalPence: gmv.gmv_pence,
        platformRevenuePence: gmv.platform_revenue_pence,
        deltaPct: gmvDelta,
      },
      sessions: {
        total: sessions.total,
        completed: sessions.completed,
        faulted: sessions.faulted,
        deltaPct: sessionDelta,
        faultRate: sessions.total > 0 ? Math.round((sessions.faulted / sessions.total) * 100) : 0,
      },
      users: {
        total: users.total_users,
        newThisPeriod: users.new_users,
        mau: users.mau,
      },
      listings: {
        active: listings.active,
        underReview: listings.under_review,
        draft: listings.draft,
      },
      disputes: { open: disputes.open_disputes },
      dailyGmv: dailyGmvRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return { date: row['date'], sessions: Number(row['sessions']), gmvPence: Number(row['gmv_pence']) }
      }),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/admin/analytics]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
