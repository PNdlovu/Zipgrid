/**
 * @file route.ts
 * @description POST /api/v1/cron/settle — payment reconciliation (every 5 min).
 *   1. Settles completed sessions whose hold is still open (lost OCPP webhook,
 *      Stripe outage, Stripe configured after the session ended).
 *   2. Releases holds on bookings whose slot ended without a session (no-show).
 *   3. Retries collection of session shortfalls (costs above the hold).
 * Without Stripe configured, only wallet payments are processed.
 *
 * Protected by the x-cron-secret header (CRON_SECRET).
 *
 * @module apps/web/api/v1/cron/settle
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { hasValidServiceSecret } from '@/lib/env'
import { errorResponse } from '@/lib/api/context'
import { SettlementService } from '@/domains/payments/SettlementService'
import { StripeService } from '@/domains/payments/StripeService'
import { ShortfallService } from '@/domains/payments/ShortfallService'

export async function POST(request: NextRequest) {
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }
  const walletOnly = !StripeService.isConfigured()
  try {
    const settled = await SettlementService.settlePending(50, walletOnly)
    const expired = await SettlementService.releaseExpiredHolds(50, walletOnly)
    const shortfalls = await ShortfallService.collectDue()
    return apiResponse({ settled, expired, shortfalls, walletOnly })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/cron/settle')
  }
}
