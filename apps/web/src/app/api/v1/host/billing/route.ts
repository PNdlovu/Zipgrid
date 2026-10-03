/**
 * @file route.ts
 * @description GET /api/v1/host/billing — the host's plan (from their Stripe
 * subscription), plan limits and this month's usage.
 *
 * @module apps/web/api/v1/host/billing
 */

import { type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { HostPlanService } from '@/domains/billing/HostPlanService'
import { PLANS } from '@/domains/billing/plans'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'

/** GET /api/v1/host/billing — SMB subscription billing status. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const plan = await HostPlanService.getStatus(userId)

    const db = await getDb()
    const usageRes = await db.execute(
      `SELECT
         (SELECT COUNT(*) FROM charger_listings cl
          WHERE cl.host_profile_id = hp.id AND cl.status <> 'deactivated')::INT AS listings,
         (SELECT COUNT(*) FROM bookings b JOIN charger_listings cl ON cl.id = b.listing_id
          WHERE cl.host_profile_id = hp.id AND b.status = 'completed'
            AND b.completed_at >= DATE_TRUNC('month', NOW()))::INT AS sessions_this_month,
         (SELECT COALESCE(SUM(t.total_charged_cents), 0) FROM transactions t
          JOIN bookings b ON b.id = t.booking_id JOIN charger_listings cl ON cl.id = b.listing_id
          WHERE cl.host_profile_id = hp.id AND t.captured_at >= DATE_TRUNC('month', NOW()))::INT AS revenue_this_month
       FROM host_profiles hp WHERE hp.user_id = $1`,
      [userId],
    )
    const u = usageRes.rows[0] ?? {}

    // Invoices and card details live in Stripe's customer portal.
    let portalUrl: string | null = null
    const customerId = plan.hasSubscription && StripeService.isConfigured() ? await StripeCustomer.getId(userId) : null
    if (customerId) {
      const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? request.nextUrl.origin
      portalUrl = await StripeService.createBillingPortalUrl(customerId, `${appUrl}/smb/billing`).catch((err: unknown) => {
        console.error('[host/billing] portal link failed', err)
        return null
      })
    }

    return apiResponse({
      billing: {
        currentPlan: plan.tier,
        commissionPct: plan.commissionPct,
        status: plan.status,
        interval: plan.interval,
        currentPeriodEnd: plan.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
        stripePortalUrl: portalUrl,
        limits: { maxListings: PLANS[plan.tier].maxListings },
        usage: {
          listings: Number(u['listings'] ?? 0),
          sessionsThisMonth: Number(u['sessions_this_month'] ?? 0),
          revenueThisMonthPence: Number(u['revenue_this_month'] ?? 0),
        },
      },
    })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/host/billing')
  }
}
