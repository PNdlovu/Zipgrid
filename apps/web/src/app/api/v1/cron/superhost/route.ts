/**
 * @file route.ts
 * @description GET /api/v1/cron/superhost — re-evaluate Superhost status now
 * (manual trigger; the scheduler runs it daily via /api/v1/cron/tick).
 * Criteria: domains/trust/SuperhostService.ts. Protected by x-cron-secret.
 *
 * @module apps/web/api/v1/cron/superhost
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { hasValidServiceSecret } from '@/lib/env'
import { Scheduler } from '@/domains/scheduling/Scheduler'

/** GET /api/v1/cron/superhost — re-evaluate Superhost status now (manual trigger; the scheduler runs it daily via /api/v1/cron/tick). */
export async function GET(request: NextRequest) {
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }
  const outcome = await Scheduler.runOne('superhost')
  if (outcome.status === 'failed') return apiError('INTERNAL_ERROR', 'Superhost evaluation failed', 500)
  return apiResponse(outcome)
}
