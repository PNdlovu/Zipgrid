/**
 * @file route.ts
 * @description GET  /api/v1/account/payouts — payout account status + earnings summary
 *              POST /api/v1/account/payouts — Stripe Connect onboarding link
 *
 * For any earner (residents included). Body: { returnPath?, refreshPath? }.
 *
 * @module apps/web/api/v1/account/payouts
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { PayoutAccountService } from '@/domains/payments/PayoutAccountService'
import { PayoutService } from '@/domains/payments/PayoutService'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const BodySchema = z.object({
  returnPath: z.string().max(300).optional(),
  refreshPath: z.string().max(300).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const [account, earnings] = await Promise.all([
      PayoutAccountService.getStatus(userId),
      PayoutService.getEarningsSummary(userId),
    ])
    return apiResponse({ ...account, earnings })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/account/payouts')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const body = BodySchema.parse(await request.json().catch(() => ({})))
    const result = await PayoutAccountService.startOnboarding(userId, {
      ...(body.returnPath ? { returnPath: body.returnPath } : {}),
      ...(body.refreshPath ? { refreshPath: body.refreshPath } : {}),
    })
    return apiResponse(result)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/account/payouts')
  }
}
