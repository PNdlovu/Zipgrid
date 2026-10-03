/**
 * @file Scheduler.ts
 * @description The platform's scheduled work, driven by one external tick
 * (Railway cron → POST /api/v1/cron/tick every 5 minutes).
 *
 *   every tick:
 *     authorize_due_bookings — card holds / wallet reservations 24h before deferred bookings
 *     settle_sessions        — capture/debit completed sessions whose settlement was missed
 *     release_no_shows       — release holds for bookings whose slot passed unused
 *     collect_shortfalls     — retry collecting session costs above the hold
 *   daily (first tick of each UTC day):
 *     reveal_reviews         — publish one-sided reviews after 14 days
 *     superhost              — promote/demote Superhosts
 *     safety_scores          — rescore live listings; pause any below 50
 *     process_deletions      — complete account deletions whose cooling-off has ended
 *
 * Jobs are isolated: one failing never stops the others. Every job is
 * idempotent, so overlapping ticks are safe. Daily jobs claim a
 * scheduled_job_runs row per UTC day; a failure deletes the claim so the next
 * tick retries. Without Stripe configured, payment jobs process wallet
 * payments only.
 *
 * @module domains/scheduling
 */

import { getDb } from '@/lib/db'
import { StripeService } from '@/domains/payments/StripeService'
import { SettlementService } from '@/domains/payments/SettlementService'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { BookingService } from '@/domains/booking/BookingService'
import { ReviewService } from '@/domains/trust/ReviewService'
import { SuperhostService } from '@/domains/trust/SuperhostService'
import { SafetyScoreService } from '@/domains/safety/SafetyScoreService'
import { GdprService } from '@/domains/compliance/GdprService'

type Frequency = 'every_tick' | 'daily'

type Job = {
  name: string
  frequency: Frequency
  run: (ctx: { walletOnly: boolean }) => Promise<unknown>
}

export type JobOutcome =
  | { job: string; status: 'ok'; result: unknown }
  | { job: string; status: 'skipped'; reason: string }
  | { job: string; status: 'failed'; error: string }

export const JOBS: Job[] = [
  { name: 'authorize_due_bookings', frequency: 'every_tick', run: ({ walletOnly }) => BookingService.authorizeDue(50, walletOnly) },
  { name: 'settle_sessions', frequency: 'every_tick', run: ({ walletOnly }) => SettlementService.settlePending(50, walletOnly) },
  { name: 'release_no_shows', frequency: 'every_tick', run: ({ walletOnly }) => SettlementService.releaseExpiredHolds(50, walletOnly) },
  { name: 'collect_shortfalls', frequency: 'every_tick', run: () => ShortfallService.collectDue() },
  { name: 'reveal_reviews', frequency: 'daily', run: () => ReviewService.revealStale() },
  { name: 'superhost', frequency: 'daily', run: () => SuperhostService.evaluateAll() },
  { name: 'safety_scores', frequency: 'daily', run: () => SafetyScoreService.recalculateAll() },
  { name: 'process_deletions', frequency: 'daily', run: () => GdprService.processDue() },
]

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 1000)

/** Claims today's run of a daily job; false when it already ran (or is running) today. */
async function claimDaily(name: string): Promise<boolean> {
  const db = await getDb()
  const res = await db.execute(
    `INSERT INTO scheduled_job_runs (job_name, run_date) VALUES ($1, (NOW() AT TIME ZONE 'UTC')::DATE)
     ON CONFLICT DO NOTHING RETURNING job_name`,
    [name],
  )
  return res.rows.length > 0
}

async function recordDaily(name: string, outcome: { result?: unknown; error?: string }): Promise<void> {
  const db = await getDb()
  if (outcome.error !== undefined) {
    // Release the claim so the next tick retries.
    await db.execute(
      `DELETE FROM scheduled_job_runs WHERE job_name = $1 AND run_date = (NOW() AT TIME ZONE 'UTC')::DATE`,
      [name],
    )
    return
  }
  await db.execute(
    `UPDATE scheduled_job_runs SET finished_at = NOW(), result = $2::jsonb
     WHERE job_name = $1 AND run_date = (NOW() AT TIME ZONE 'UTC')::DATE`,
    [name, JSON.stringify(outcome.result ?? null)],
  )
}

export const Scheduler = {
  /** Runs every due job once. Never throws; returns one outcome per job. */
  async tick(jobs: Job[] = JOBS): Promise<JobOutcome[]> {
    const ctx = { walletOnly: !StripeService.isConfigured() }
    const outcomes: JobOutcome[] = []
    for (const job of jobs) {
      try {
        if (job.frequency === 'daily' && !(await claimDaily(job.name))) {
          outcomes.push({ job: job.name, status: 'skipped', reason: 'already_ran_today' })
          continue
        }
        const result = await job.run(ctx)
        if (job.frequency === 'daily') await recordDaily(job.name, { result })
        outcomes.push({ job: job.name, status: 'ok', result })
      } catch (err) {
        console.error(`[Scheduler] ${job.name} failed`, err)
        if (job.frequency === 'daily') await recordDaily(job.name, { error: message(err) }).catch(() => {})
        outcomes.push({ job: job.name, status: 'failed', error: message(err) })
      }
    }
    return outcomes
  },

  /** Runs a single named job now (manual trigger), regardless of frequency. */
  async runOne(name: string): Promise<JobOutcome> {
    const job = JOBS.find((j) => j.name === name)
    if (!job) return { job: name, status: 'skipped', reason: 'unknown_job' }
    try {
      return { job: name, status: 'ok', result: await job.run({ walletOnly: !StripeService.isConfigured() }) }
    } catch (err) {
      console.error(`[Scheduler] ${name} failed`, err)
      return { job: name, status: 'failed', error: message(err) }
    }
  },
}
