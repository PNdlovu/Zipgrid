/**
 * @file route.ts
 * @description GET /api/cron/reveal-reviews — publish one-sided reviews older
 * than 14 days now (manual trigger; the scheduler runs it daily via
 * /api/v1/cron/tick). Protected by the x-cron-secret header (CRON_SECRET).
 *
 * @module apps/web/api/cron/reveal-reviews
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { hasValidServiceSecret } from '@/lib/env'
import { Scheduler } from '@/domains/scheduling/Scheduler'

export const dynamic = 'force-dynamic'

/** GET /api/cron/reveal-reviews — publish one-sided reviews older than 14 days now (manual trigger; the scheduler runs it daily via /api/v1/cron/tick). */
export async function GET(request: NextRequest) {
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }
  const outcome = await Scheduler.runOne('reveal_reviews')
  if (outcome.status === 'failed') return apiError('INTERNAL_ERROR', 'Review reveal failed', 500)
  return apiResponse(outcome)
}
