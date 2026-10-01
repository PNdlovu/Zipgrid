/**
 * @file route.ts
 * @description GET /api/v1/fleet/admin
 * Returns full fleet account data for fleet admins: drivers, policy,
 * analytics (this month vs last month), and top driver.
 * Requires fleet_admin role in fleet_members.
 *
 * @module apps/web/api/v1/fleet/admin
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, ForbiddenError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify fleet admin role
    const adminRes = await db.execute(
      `SELECT fm.fleet_account_id, fa.company_name,
              fa.max_spend_per_session_pence, fa.max_spend_per_month_pence,
              fa.allowed_listing_types, fa.requires_approval, fa.invoice_status
       FROM fleet_members fm
       JOIN fleet_accounts fa ON fa.id = fm.fleet_account_id
       WHERE fm.user_id = $1 AND fm.role = 'fleet_admin' AND fm.status = 'active'
       LIMIT 1`,
      [userId],
    )
    if (adminRes.rows.length === 0) throw new ForbiddenError('Fleet admin access required')

    const account = adminRes.rows[0] as {
      fleet_account_id: string
      company_name: string
      max_spend_per_session_pence: number | null
      max_spend_per_month_pence: number | null
      allowed_listing_types: string[]
      requires_approval: boolean
      invoice_status: string
    }
    const fleetId = account.fleet_account_id

    // ── All fleet members ─────────────────────────────────────────
    const membersRes = await db.execute(
      `SELECT
         fm.user_id,
         u.full_name,
         u.email,
         fm.created_at AS joined_at,
         fm.status,
         COALESCE(usage.sessions, 0)::INT   AS this_month_sessions,
         COALESCE(usage.spend_pence, 0)::INT AS this_month_spend_pence,
         COALESCE(usage.kwh, 0)::NUMERIC    AS this_month_kwh
       FROM fleet_members fm
       JOIN users u ON u.id = fm.user_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(b.id)::INT AS sessions,
           COALESCE(SUM(t.total_charged_cents), 0)::INT AS spend_pence,
           COALESCE(SUM(cs.energy_consumed_wh / 1000.0), 0)::NUMERIC AS kwh
         FROM driver_profiles dp
         JOIN bookings b ON b.driver_profile_id = dp.id
           AND b.status = 'completed'
           AND b.completed_at >= DATE_TRUNC('month', NOW())
         LEFT JOIN charging_sessions cs ON cs.booking_id = b.id
         LEFT JOIN transactions t ON t.booking_id = b.id
         WHERE dp.user_id = fm.user_id
       ) usage ON TRUE
       WHERE fm.fleet_account_id = $1
       ORDER BY usage.spend_pence DESC NULLS LAST`,
      [fleetId],
    )

    // ── This month analytics ──────────────────────────────────────
    const thisMonthRes = await db.execute(
      `SELECT
         COALESCE(SUM(t.total_charged_cents), 0)::INT AS total_spend_pence,
         COUNT(b.id)::INT AS total_sessions,
         COALESCE(SUM(cs.energy_consumed_wh / 1000.0), 0)::NUMERIC(12,2) AS total_kwh
       FROM fleet_members fm
       JOIN driver_profiles dp ON dp.user_id = fm.user_id
       JOIN bookings b ON b.driver_profile_id = dp.id
         AND b.status = 'completed'
         AND b.completed_at >= DATE_TRUNC('month', NOW())
       LEFT JOIN charging_sessions cs ON cs.booking_id = b.id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE fm.fleet_account_id = $1`,
      [fleetId],
    )

    // ── Last month analytics ──────────────────────────────────────
    const lastMonthRes = await db.execute(
      `SELECT
         COALESCE(SUM(t.total_charged_cents), 0)::INT AS total_spend_pence,
         COUNT(b.id)::INT AS total_sessions,
         COALESCE(SUM(cs.energy_consumed_wh / 1000.0), 0)::NUMERIC(12,2) AS total_kwh
       FROM fleet_members fm
       JOIN driver_profiles dp ON dp.user_id = fm.user_id
       JOIN bookings b ON b.driver_profile_id = dp.id
         AND b.status = 'completed'
         AND b.completed_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
         AND b.completed_at <  DATE_TRUNC('month', NOW())
       LEFT JOIN charging_sessions cs ON cs.booking_id = b.id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE fm.fleet_account_id = $1`,
      [fleetId],
    )

    type MemberRow = {
      user_id: string; full_name: string; email: string; joined_at: string
      status: string; this_month_sessions: number; this_month_spend_pence: number; this_month_kwh: number
    }
    const thisMonth  = thisMonthRes.rows[0]  as { total_spend_pence: number; total_sessions: number; total_kwh: number }
    const lastMonth  = lastMonthRes.rows[0]  as { total_spend_pence: number; total_sessions: number; total_kwh: number }
    const topDriver  = (membersRes.rows[0]   as MemberRow | undefined)

    const avgCost = thisMonth.total_sessions > 0
      ? Math.round(thisMonth.total_spend_pence / thisMonth.total_sessions)
      : 0

    return apiResponse({
      fleet: {
        id:          fleetId,
        companyName: account.company_name,
        drivers: (membersRes.rows as MemberRow[]).map((m) => ({
          userId:               m.user_id,
          fullName:             m.full_name,
          email:                m.email,
          joinedAt:             m.joined_at,
          status:               m.status,
          thisMonthSessions:    m.this_month_sessions,
          thisMonthSpendPence:  m.this_month_spend_pence,
          thisMonthKwh:         Number(m.this_month_kwh),
        })),
        policy: {
          maxSpendPerSessionPence: account.max_spend_per_session_pence,
          maxSpendPerMonthPence:   account.max_spend_per_month_pence,
          allowedListingTypes:     account.allowed_listing_types ?? [],
          requiresApproval:        Boolean(account.requires_approval),
        },
        analytics: {
          thisMonth: {
            totalSpendPence:  Number(thisMonth.total_spend_pence),
            totalSessions:    Number(thisMonth.total_sessions),
            totalKwh:         Number(thisMonth.total_kwh),
          },
          lastMonth: {
            totalSpendPence:  Number(lastMonth.total_spend_pence),
            totalSessions:    Number(lastMonth.total_sessions),
            totalKwh:         Number(lastMonth.total_kwh),
          },
          topDriverId:               topDriver?.user_id ?? null,
          topDriverName:             topDriver?.full_name ?? null,
          avgCostPerSessionPence:    avgCost,
        },
      },
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[fleet/admin]', err)
    return apiError('INTERNAL_ERROR', 'Could not load fleet admin data', 500)
  }
}
