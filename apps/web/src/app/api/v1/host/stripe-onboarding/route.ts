/**
 * @file route.ts
 * @description GET  /api/v1/host/stripe-onboarding — payout account status
 *              POST /api/v1/host/stripe-onboarding — Stripe Connect onboarding link
 *
 * Kept for the host UI; delegates to PayoutAccountService (the same account is
 * used for every kind of earning). Body: { returnUrl?, refreshUrl? } — only
 * same-site paths are honoured.
 *
 * @module apps/web/api/v1/host/stripe-onboarding
 */

import { type NextRequest } from 'next/server'
import { PayoutAccountService } from '@/domains/payments/PayoutAccountService'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

function toPath(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  try {
    const u = new URL(url, 'http://local')
    return `${u.pathname}${u.search}`
  } catch {
    return undefined
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const status = await PayoutAccountService.getStatus(userId)
    return apiResponse({ stripeConnectAccountId: status.accountId, stripeConnectOnboarded: status.payoutsEnabled })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/host/stripe-onboarding')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const body = (await request.json().catch(() => ({}))) as { returnUrl?: unknown; refreshUrl?: unknown }
    const result = await PayoutAccountService.startOnboarding(userId, {
      returnPath: toPath(body.returnUrl) ?? '/host/settings?stripe=success',
      refreshPath: toPath(body.refreshUrl) ?? '/host/settings?stripe=refresh',
    })
    return apiResponse(result)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/host/stripe-onboarding')
  }
}
