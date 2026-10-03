/**
 * @file route.ts
 * @description POST /api/v1/cron/settle — run the payment jobs now (manual
 * trigger): authorise due bookings, settle sessions, release no-shows,
 * collect shortfalls. The scheduler runs these every 5 minutes via
 * /api/v1/cron/tick. Protected by the x-cron-secret header (CRON_SECRET).
 *
 * @module apps/web/api/v1/cron/settle
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { hasValidServiceSecret } from '@/lib/env'
import { JOBS, Scheduler } from '@/domains/scheduling/Scheduler'

/** POST /api/v1/cron/settle — run the payment jobs now (manual trigger): authorise due bookings, settle sessions, release no-shows, collect shortfalls. */
export async function POST(request: NextRequest) {
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }
  const outcomes = await Scheduler.tick(JOBS.filter((j) => j.frequency === 'every_tick'))
  return apiResponse({ outcomes })
}
