/**
 * @file route.ts
 * @description POST /api/v1/cron/tick — runs all scheduled work (see
 * domains/scheduling/Scheduler.ts). Called every 5 minutes by the Railway cron
 * service. Protected by the x-cron-secret header (CRON_SECRET).
 *
 * Responds 200 with one outcome per job; 500 when any job failed, so the cron
 * run shows as failed in Railway.
 *
 * @module apps/web/api/v1/cron/tick
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { hasValidServiceSecret } from '@/lib/env'
import { Scheduler } from '@/domains/scheduling/Scheduler'

export const dynamic = 'force-dynamic'

/** POST /api/v1/cron/tick — runs all scheduled work (see domains/scheduling/Scheduler.ts). */
export async function POST(request: NextRequest) {
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }
  const outcomes = await Scheduler.tick()
  const failed = outcomes.filter((o) => o.status === 'failed').map((o) => o.job)
  if (failed.length > 0) return apiError('JOBS_FAILED', `Scheduled jobs failed: ${failed.join(', ')}`, 500)
  return apiResponse({ outcomes })
}
