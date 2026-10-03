/**
 * @file route.ts
 * @description POST /api/v1/host/billing/change-plan — { tier, interval }
 * Starts or changes the host's plan subscription (see HostPlanService.changePlan):
 *   action 'checkout'         → redirect the browser to checkoutUrl
 *   action 'updated'          → plan switched (prorated) or applied
 *   action 'cancel_scheduled' → paid plan ends at effectiveAt, then Starter
 *   action 'resumed'          → a scheduled cancellation was withdrawn
 *   action 'unchanged'        → nothing to do
 *
 * @module apps/web/api/v1/host/billing/change-plan
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { HostPlanService } from '@/domains/billing/HostPlanService'

const BodySchema = z.object({
  tier: z.enum(['starter', 'growth', 'pro']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
})

/** POST /api/v1/host/billing/change-plan — start, switch, cancel or resume the host plan. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let raw: unknown
    try { raw = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'tier must be starter, growth or pro', 422)
    const { tier, interval } = parsed.data

    // Choosing the current paid plan again while it is set to cancel = keep it.
    const current = await HostPlanService.getStatus(userId)
    if (tier === current.tier && tier !== 'starter' && current.cancelAtPeriodEnd && current.interval === interval) {
      await HostPlanService.resume(userId)
      return apiResponse({ action: 'resumed' })
    }

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? request.nextUrl.origin
    return apiResponse(await HostPlanService.changePlan(userId, tier, interval, appUrl))
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/host/billing/change-plan')
  }
}
