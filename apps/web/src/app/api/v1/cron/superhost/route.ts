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
import { hasValidServiceSecret } from '@/lib/env'

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Evaluate all hosts
    // Each metric is an independent subquery — joining listings, bookings,
    // reviews and incidents together would multiply the counts.
    const hostsRes = await db.execute(
      `SELECT hp.id AS host_profile_id, hp.is_superhost,
              (SELECT COUNT(*) FROM bookings b JOIN charger_listings cl ON cl.id = b.listing_id
               WHERE cl.host_profile_id = hp.id AND b.status = 'completed'
                 AND b.completed_at >= NOW() - INTERVAL '12 months')::INT AS sessions_12m,
              (SELECT AVG(r.overall_rating) FROM reviews r JOIN charger_listings cl ON cl.id = r.listing_id
               WHERE cl.host_profile_id = hp.id AND r.subject = 'listing' AND r.status = 'published'
                 AND r.created_at >= NOW() - INTERVAL '12 months') AS avg_rating,
              (SELECT COUNT(*) FROM incident_reports ir JOIN charger_listings cl ON cl.id = ir.listing_id
               WHERE cl.host_profile_id = hp.id AND ir.status <> 'resolved_no_claim'
                 AND ir.created_at >= NOW() - INTERVAL '6 months')::INT AS incidents_6m,
              (SELECT COUNT(*) FROM bookings b JOIN charger_listings cl ON cl.id = b.listing_id
               WHERE cl.host_profile_id = hp.id
                 AND b.created_at >= NOW() - INTERVAL '3 months')::INT AS total_bookings_3m,
              (SELECT COUNT(*) FROM bookings b JOIN charger_listings cl ON cl.id = b.listing_id
               WHERE cl.host_profile_id = hp.id AND b.status IN ('confirmed', 'active', 'completed')
                 AND b.created_at >= NOW() - INTERVAL '3 months')::INT AS responded_bookings_3m,
              (SELECT COUNT(*) FROM charger_listings cl
               WHERE cl.host_profile_id = hp.id AND cl.status = 'active')::INT AS active_listings
       FROM host_profiles hp
       WHERE hp.deleted_at IS NULL`,
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
