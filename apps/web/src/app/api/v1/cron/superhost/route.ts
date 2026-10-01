/**
 * @file route.ts
 * @description GET /api/v1/cron/superhost — Superhost promotion cron job.
 * Runs nightly (via Vercel Cron or pg_cron) to evaluate all hosts against
 * the Superhost criteria and promote / demote accordingly.
 *
 * Superhost criteria:
 *   - ≥ 20 completed sessions in the last 12 months
 *   - Average rating ≥ 4.8 across all sessions
 *   - Zero incidents in the last 6 months
 *   - Response rate ≥ 90% (approved + instant-booked / total bookings)
 *   - At least 1 active listing
 *
 * Protected by CRON_SECRET header.
 *
 * @module apps/web/api/v1/cron/superhost
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.headers.get('x-cron-secret') ?? request.nextUrl.searchParams.get('secret')
  if (secret !== process.env['CRON_SECRET']) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Evaluate all hosts
    const hostsRes = await db.execute(
      `SELECT hp.id AS host_profile_id, hp.is_superhost,
              COUNT(b.id) FILTER (
                WHERE b.status = 'completed'
                AND b.completed_at >= NOW() - INTERVAL '12 months'
              )::INT AS sessions_12m,
              AVG(r.rating_overall) FILTER (
                WHERE r.created_at >= NOW() - INTERVAL '12 months'
              ) AS avg_rating,
              COUNT(ir.id) FILTER (
                WHERE ir.created_at >= NOW() - INTERVAL '6 months'
                AND ir.status NOT IN ('dismissed')
              )::INT AS incidents_6m,
              COUNT(b.id) FILTER (
                WHERE b.created_at >= NOW() - INTERVAL '3 months'
              )::INT AS total_bookings_3m,
              COUNT(b.id) FILTER (
                WHERE b.created_at >= NOW() - INTERVAL '3 months'
                AND b.status IN ('confirmed', 'completed')
              )::INT AS responded_bookings_3m,
              COUNT(cl.id) FILTER (WHERE cl.status = 'active')::INT AS active_listings
       FROM host_profiles hp
       LEFT JOIN charger_listings cl ON cl.host_profile_id = hp.id
       LEFT JOIN bookings b ON b.listing_id = cl.id
       LEFT JOIN reviews r ON r.listing_id = cl.id AND r.reviewer_role = 'driver'
       LEFT JOIN incident_reports ir ON ir.listing_id = cl.id
       GROUP BY hp.id, hp.is_superhost`,
      [],
    )

    type HostRow = {
      host_profile_id: string
      is_superhost: boolean
      sessions_12m: number
      avg_rating: number | null
      incidents_6m: number
      total_bookings_3m: number
      responded_bookings_3m: number
      active_listings: number
    }

    let promoted = 0
    let demoted  = 0

    for (const row of hostsRes.rows as HostRow[]) {
      const responsePct = row.total_bookings_3m > 0
        ? (row.responded_bookings_3m / row.total_bookings_3m) * 100
        : 100

      const qualifies = (
        row.sessions_12m >= 20
        && (row.avg_rating ?? 0) >= 4.8
        && row.incidents_6m === 0
        && responsePct >= 90
        && row.active_listings >= 1
      )

      if (qualifies && !row.is_superhost) {
        await db.execute(
          `UPDATE host_profiles SET is_superhost = TRUE, updated_at = NOW()
           WHERE id = $1`,
          [row.host_profile_id],
        )
        // Fire event so notification service can congratulate the host
        const { eventBus } = await import('@/lib/events/event-bus')
        eventBus.publish({
          type: 'SUPERHOST_AWARDED',
          hostProfileId: row.host_profile_id,
        })
        promoted++
      } else if (!qualifies && row.is_superhost) {
        await db.execute(
          `UPDATE host_profiles SET is_superhost = FALSE, updated_at = NOW()
           WHERE id = $1`,
          [row.host_profile_id],
        )
        demoted++
      }
    }

    return apiResponse({
      evaluated: hostsRes.rows.length,
      promoted,
      demoted,
      ranAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/superhost]', err)
    return apiError('INTERNAL_ERROR', 'Superhost cron failed', 500)
  }
}
