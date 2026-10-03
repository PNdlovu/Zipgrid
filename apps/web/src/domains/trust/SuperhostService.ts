/**
 * @file SuperhostService.ts
 * @description Superhost status: promotes hosts who meet every criterion and
 * demotes those who no longer do. Called daily by the scheduler.
 *
 * Criteria (all required):
 *   - ≥ 20 completed sessions in the last 12 months
 *   - average published listing rating ≥ 4.8 (last 12 months)
 *   - no unresolved-with-claim incidents in the last 6 months
 *   - ≥ 90% of bookings in the last 3 months confirmed/active/completed
 *   - ≥ 1 active listing
 *
 * @module domains/trust
 */

import { getDb } from '@/lib/db'
import { eventBus } from '@/lib/events/event-bus'

export const SUPERHOST_CRITERIA = {
  minSessions12m: 20,
  minAverageRating: 4.8,
  maxIncidents6m: 0,
  minResponsePct: 90,
  minActiveListings: 1,
} as const

type HostMetrics = {
  host_profile_id: string
  is_superhost: boolean
  sessions_12m: number
  avg_rating: number | null
  incidents_6m: number
  total_bookings_3m: number
  responded_bookings_3m: number
  active_listings: number
}

/** True when a host's metrics meet every Superhost criterion. */
export function qualifiesForSuperhost(m: Omit<HostMetrics, 'host_profile_id' | 'is_superhost'>): boolean {
  const responsePct = m.total_bookings_3m > 0 ? (m.responded_bookings_3m / m.total_bookings_3m) * 100 : 100
  return (
    m.sessions_12m >= SUPERHOST_CRITERIA.minSessions12m
    && Number(m.avg_rating ?? 0) >= SUPERHOST_CRITERIA.minAverageRating
    && m.incidents_6m <= SUPERHOST_CRITERIA.maxIncidents6m
    && responsePct >= SUPERHOST_CRITERIA.minResponsePct
    && m.active_listings >= SUPERHOST_CRITERIA.minActiveListings
  )
}

export const SuperhostService = {
  async evaluateAll(): Promise<{ evaluated: number; promoted: number; demoted: number }> {
    const db = await getDb()
    // Each metric is an independent subquery — joining listings, bookings,
    // reviews and incidents together would multiply the counts.
    const res = await db.execute(
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
    )

    let promoted = 0
    let demoted = 0
    for (const row of res.rows as HostMetrics[]) {
      const qualifies = qualifiesForSuperhost(row)
      if (qualifies === Boolean(row.is_superhost)) continue
      await db.execute(
        `UPDATE host_profiles SET is_superhost = $2, updated_at = NOW() WHERE id = $1`,
        [row.host_profile_id, qualifies],
      )
      if (qualifies) {
        eventBus.publish({ type: 'SUPERHOST_AWARDED', hostProfileId: row.host_profile_id })
        promoted++
      } else {
        demoted++
      }
    }
    return { evaluated: res.rows.length, promoted, demoted }
  },
}
