/**
 * @file plan-gate.ts
 * @description Route helper: returns a 403 PLAN_UPGRADE_REQUIRED response when
 * the caller's host plan doesn't include a feature, otherwise null.
 *
 * @module lib/api
 */

import { type NextResponse } from 'next/server'
import { HostPlanService } from '@/domains/billing/HostPlanService'
import type { PlanFeature } from '@/domains/billing/plans'
import { errorResponse } from '@/lib/api/context'
import type { ApiErrorResponse } from '@/lib/api/response'

/** Null when allowed; otherwise the error response to return. */
export async function planGate(userId: string, feature: PlanFeature): Promise<NextResponse<ApiErrorResponse> | null> {
  try {
    await HostPlanService.requireFeature(userId, feature)
    return null
  } catch (err) {
    return errorResponse(err, `planGate:${feature}`)
  }
}
