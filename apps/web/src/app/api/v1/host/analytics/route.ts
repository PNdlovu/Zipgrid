/**
 * @file route.ts
 * @description GET /api/v1/host/analytics
 * Returns SMB host analytics: per-charger revenue, utilisation rate,
 * peak hours heatmap, session value breakdown, and earnings summary.
 *
 * Query params:
 *   period — 7d | 30d | 90d | 365d (default: 30d)
 *   listingId — filter to a single listing (optional)
 *
 * @module apps/web/api/v1/host/analytics
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { planGate } from '@/lib/api/plan-gate'

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }

/** GET /api/v1/host/analytics — Returns SMB host analytics: per-charger revenue, utilisation rate, peak hours heatmap, session value breakdown, and earnings summary. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const blocked = await planGate(userId, 'analytics')
  if (blocked) return blocked

  const { searchParams } = request.nextUrl
  const periodKey = searchParams.get('period') ?? '30d'
  const days = PERIOD_DAYS[periodKey] ?? 30
  const listingIdFilter = searchParams.get('listingId') ?? null

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify user is a host
    const hostRes = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)
    const hostProfileId = (hostRes.rows[0] as { id: string }).id

    const sinceDate = new Date(Date.now() - days * 86_400_000).toISOString()

    // ── Parameterised listing filter ──────────────────────────────
    // Always filter by host_profile_id ($2). Optionally also filter by
    // listing id ($3) — both passed as parameters, never interpolated.
    const listingParams: unknown[] = [sinceDate, hostProfileId]
    let listingClause = `cl.host_profile_id = $2`
    if (listingIdFilter) {
      listingParams.push(listingIdFilter)
      listingClause = `cl.host_profile_id = $2 AND cl.id = $${listingParams.length}`
    }

    // ── 1. Earnings & session summary ─────────────────────────────
    const summaryRes = await db.execute(
      `SELECT
         COUNT(cs.id)::INT                          AS total_sessions,
         COALESCE(SUM(cs.total_session_cost_cents), 0)::INT AS gross_revenue_pence,
         COALESCE(SUM(cs.energy_consumed_wh), 0)::BIGINT AS total_wh,
         ROUND(AVG(cs.total_session_cost_cents))::INT       AS avg_session_pence,
         ROUND(AVG(cs.energy_consumed_wh / 1000.0)::NUMERIC, 2) AS avg_kwh
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       WHERE ${listingClause}
         AND cs.status = 'completed'
         AND cs.started_at >= $1`,
      listingParams,
    )
    const summary = summaryRes.rows[0] as {
      total_sessions: number
      gross_revenue_pence: number
      total_wh: number
      avg_session_pence: number
      avg_kwh: string
    }

    // ── 2. Per-charger breakdown ───────────────────────────────────
    const perChargerRes = await db.execute(
      `SELECT
         cl.id AS listing_id,
         cl.title,
         cl.city,
         cl.max_power_kw,
         COUNT(cs.id)::INT                          AS sessions,
         COALESCE(SUM(cs.total_session_cost_cents), 0)::INT AS revenue_pence,
         COALESCE(SUM(cs.energy_consumed_wh), 0)::BIGINT AS energy_wh,
         ROUND(AVG(cs.total_session_cost_cents))::INT       AS avg_session_pence
       FROM charger_listings cl
       LEFT JOIN bookings b ON b.listing_id = cl.id
       LEFT JOIN charging_sessions cs ON cs.booking_id = b.id
         AND cs.status = 'completed' AND cs.started_at >= $1
       WHERE ${listingClause}
       GROUP BY cl.id, cl.title, cl.city, cl.max_power_kw
       ORDER BY revenue_pence DESC`,
      listingParams,
    )

    // ── 3. Daily revenue for chart (last N days) ──────────────────
    const dailyRes = await db.execute(
      `SELECT
         DATE(cs.started_at)::TEXT AS date,
         COUNT(cs.id)::INT         AS sessions,
         COALESCE(SUM(cs.total_session_cost_cents), 0)::INT AS revenue_pence
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       WHERE ${listingClause}
         AND cs.status = 'completed'
         AND cs.started_at >= $1
       GROUP BY DATE(cs.started_at)
       ORDER BY date ASC`,
      listingParams,
    )

    // ── 4. Peak hours heatmap (hour 0–23 × day 0–6) ───────────────
    const heatmapRes = await db.execute(
      `SELECT
         EXTRACT(DOW FROM cs.started_at)::INT  AS day_of_week,
         EXTRACT(HOUR FROM cs.started_at)::INT AS hour_of_day,
         COUNT(cs.id)::INT                     AS session_count
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       WHERE ${listingClause}
         AND cs.status = 'completed'
         AND cs.started_at >= $1
       GROUP BY day_of_week, hour_of_day
       ORDER BY day_of_week, hour_of_day`,
      listingParams,
    )

    // ── 5. Utilisation rate ────────────────────────────────────────
    const utilisationRes = await db.execute(
      `SELECT
         COALESCE(SUM(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at)) / 3600), 0) AS used_hours,
         COUNT(DISTINCT cl.id)::INT AS listing_count
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN charger_listings cl ON cl.id = b.listing_id
       WHERE ${listingClause}
         AND cs.status = 'completed'
         AND cs.started_at >= $1
         AND cs.ended_at IS NOT NULL`,
      listingParams,
    )
    const util = utilisationRes.rows[0] as { used_hours: string; listing_count: number }
    const availableHours = (util.listing_count || 1) * days * 12 // 12 usable hours per day per charger
    const utilisationPct = Math.min(
      Math.round((parseFloat(util.used_hours) / availableHours) * 100),
      100,
    )

    return apiResponse({
      period: periodKey,
      sinceDate,
      summary: {
        totalSessions: summary.total_sessions,
        grossRevenuePence: summary.gross_revenue_pence,
        netRevenuePence: Math.round(summary.gross_revenue_pence * 0.85), // 15% platform fee
        totalKwh: Number((summary.total_wh / 1000).toFixed(2)),
        avgSessionPence: summary.avg_session_pence ?? 0,
        avgKwh: Number(summary.avg_kwh ?? 0),
        utilisationPct,
      },
      chargers: perChargerRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          listingId: row['listing_id'],
          title: row['title'],
          city: row['city'],
          maxPowerKw: Number(row['max_power_kw']),
          sessions: Number(row['sessions']),
          revenuePence: Number(row['revenue_pence']),
          energyKwh: Number((Number(row['energy_wh']) / 1000).toFixed(2)),
          avgSessionPence: Number(row['avg_session_pence'] ?? 0),
        }
      }),
      dailyRevenue: dailyRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return { date: row['date'], sessions: Number(row['sessions']), revenuePence: Number(row['revenue_pence']) }
      }),
      peakHoursHeatmap: heatmapRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return { dayOfWeek: Number(row['day_of_week']), hourOfDay: Number(row['hour_of_day']), sessionCount: Number(row['session_count']) }
      }),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/host/analytics]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
