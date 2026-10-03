/**
 * @file route.ts
 * @description GET /api/v1/host/billing — SMB subscription billing status.
 * Returns current plan, status, next renewal, Stripe portal URL, and usage.
 *
 * POST /api/v1/host/billing/change-plan — upgrade/downgrade subscription.
 * Returns a Stripe Checkout URL for the new plan.
 *
 * @module apps/web/api/v1/host/billing
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import Stripe from 'stripe'
import { type NextRequest } from 'next/server'

import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/host/billing — SMB subscription billing status. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const hostRes = await db.execute(
      `SELECT hp.id, hp.platform_tier, hp.commission_rate_pct,
              hp.total_listings, hp.total_sessions_hosted, hp.total_earnings_cents,
              u.stripe_customer_id
       FROM host_profiles hp
       JOIN users u ON u.id = hp.user_id
       WHERE hp.user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)

    const host = hostRes.rows[0] as {
      id: string
      platform_tier: string
      commission_rate_pct: number
      total_listings: number
      total_sessions_hosted: number
      total_earnings_cents: number
      stripe_customer_id: string | null
    }

    // ── Usage this month ──────────────────────────────────────────
    const usageRes = await db.execute(
      `SELECT
         COUNT(cs.id)::INT AS sessions_this_month,
         COALESCE(SUM(t.total_charged_cents), 0)::INT AS revenue_this_month_pence,
         COUNT(DISTINCT cl.id)::INT AS active_listings
       FROM host_profiles hp
       JOIN charger_listings cl ON cl.host_profile_id = hp.id AND cl.status = 'active'
       LEFT JOIN bookings b ON b.listing_id = cl.id
         AND b.status = 'completed'
         AND b.completed_at >= DATE_TRUNC('month', NOW())
       LEFT JOIN charging_sessions cs ON cs.booking_id = b.id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE hp.user_id = $1`,
      [userId],
    )

    const usage = usageRes.rows[0] as {
      sessions_this_month: number
      revenue_this_month_pence: number
      active_listings: number
    }

    // ── Stripe portal URL ─────────────────────────────────────────
    let stripePortalUrl: string | null = null
    if (host.stripe_customer_id) {
      try {
        const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', { apiVersion: '2024-06-20' })
        const portal = await stripe.billingPortal.sessions.create({
          customer: host.stripe_customer_id,
          return_url: `${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/smb/billing`,
        })
        stripePortalUrl = portal.url
      } catch { /* non-fatal — portal URL is optional */ }
    }

    // For now: plan status comes from the host_profiles.platform_tier column
    // In production: sync from Stripe subscription webhooks
    const billing = {
      currentPlan:        host.platform_tier,
      status:             'active' as const,
      currentPeriodEnd:   new Date(Date.now() + 30 * 86_400_000).toISOString(), // approx
      cancelAtPeriodEnd:  false,
      stripePortalUrl,
      usage: {
        activeListings:          usage.active_listings,
        sessionsThisMonth:       usage.sessions_this_month,
        revenueThisMonthPence:   usage.revenue_this_month_pence,
        apiCallsThisMonth:       0, // not tracked yet
      },
    }

    return apiResponse({ billing })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[host/billing]', err)
    return apiError('INTERNAL_ERROR', 'Could not load billing data', 500)
  }
}
