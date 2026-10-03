/**
 * @file route.ts
 * @description GET /api/v1/fleet/membership
 * Returns the authenticated driver's fleet account membership, spend policy,
 * this-month usage summary, and invoice status.
 *
 * Returns 404 if the user is not part of any fleet.
 *
 * @module apps/web/api/v1/fleet/membership
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/fleet/membership — Returns the authenticated driver's fleet account membership, spend policy, this-month usage summary, and invoice status. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Check fleet membership
    const memberRes = await db.execute(
      `SELECT
         fm.fleet_account_id,
         fm.role,
         fm.status AS member_status,
         fa.company_name,
         fa.max_spend_per_session_pence,
         fa.max_spend_per_month_pence,
         fa.allowed_listing_types,
         fa.requires_approval,
         fa.invoice_status
       FROM fleet_members fm
       JOIN fleet_accounts fa ON fa.id = fm.fleet_account_id
       WHERE fm.user_id = $1 AND fm.status = 'active'
       LIMIT 1`,
      [userId],
    )

    if (memberRes.rows.length === 0) {
      return apiError('NOT_FOUND', 'No fleet membership found', 404)
    }

    const member = memberRes.rows[0] as {
      fleet_account_id: string
      role: string
      company_name: string
      max_spend_per_session_pence: number | null
      max_spend_per_month_pence: number | null
      allowed_listing_types: string[]
      requires_approval: boolean
      invoice_status: string
    }

    // This month's usage for this driver
    const usageRes = await db.execute(
      `SELECT
         COUNT(cs.id)::INT AS sessions_count,
         COALESCE(SUM(t.total_charged_cents), 0)::INT AS total_spend_pence,
         COALESCE(SUM(cs.energy_consumed_wh / 1000.0), 0)::NUMERIC(10,2) AS total_kwh
       FROM driver_profiles dp
       JOIN bookings b ON b.driver_profile_id = dp.id
         AND b.status = 'completed'
         AND b.completed_at >= DATE_TRUNC('month', NOW())
       LEFT JOIN charging_sessions cs ON cs.booking_id = b.id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE dp.user_id = $1`,
      [userId],
    )

    const usage = usageRes.rows[0] as {
      sessions_count: number
      total_spend_pence: number
      total_kwh: number
    }

    return apiResponse({
      fleet: {
        fleetAccountId: member.fleet_account_id,
        companyName:    member.company_name,
        role:           member.role,
        spendPolicy: {
          maxSpendPerSessionPence: member.max_spend_per_session_pence,
          maxSpendPerMonthPence:   member.max_spend_per_month_pence,
          allowedListingTypes:     member.allowed_listing_types ?? [],
          requiresApproval:        Boolean(member.requires_approval),
        },
        thisMonth: {
          sessionsCount:    usage.sessions_count,
          totalSpendPence:  usage.total_spend_pence,
          totalKwh:         Number(usage.total_kwh),
        },
        invoiceStatus: member.invoice_status ?? 'current',
      },
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[fleet/membership]', err)
    return apiError('INTERNAL_ERROR', 'Could not load fleet membership', 500)
  }
}
