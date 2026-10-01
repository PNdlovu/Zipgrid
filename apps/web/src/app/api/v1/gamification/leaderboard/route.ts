/**
 * @file route.ts
 * @description GET /api/v1/gamification/leaderboard — platform leaderboard + eco milestones.
 * @module apps/web/api/v1/gamification/leaderboard
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'

const ECO_MILESTONES = [
  { id: 'co2_10kg',   label: '10 kg CO₂ avoided',   icon: '🌱', thresholdKg: 10 },
  { id: 'co2_50kg',   label: '50 kg CO₂ avoided',   icon: '🌿', thresholdKg: 50 },
  { id: 'co2_100kg',  label: '100 kg CO₂ avoided',  icon: '🌳', thresholdKg: 100 },
  { id: 'co2_500kg',  label: '500 kg CO₂ avoided',  icon: '🏞', thresholdKg: 500 },
  { id: 'co2_1000kg', label: '1 tonne CO₂ avoided', icon: '🌍', thresholdKg: 1000 },
  { id: 'kwh_100',    label: '100 kWh charged',      icon: '⚡', thresholdKg: 0 },
]

/** GET /api/v1/gamification/leaderboard */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const tab    = request.nextUrl.searchParams.get('tab') ?? 'hosts'

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    let entries: unknown[] = []

    if (tab === 'hosts') {
      const res = await db.execute(
        `SELECT
           RANK() OVER (ORDER BY hp.total_sessions_hosted DESC) AS rank,
           u.id AS user_id, u.full_name AS display_name, u.avatar_url,
           hp.total_sessions_hosted AS total_sessions,
           hp.total_listings,
           hp.is_superhost,
           hp.average_rating,
           rb.current_tier AS tier,
           COALESCE(rb.total_points / 100, 0) AS badge_count,
           COALESCE(SUM(cl.total_kwh_delivered), 0)::NUMERIC(12,2) AS total_kwh_delivered,
           0::NUMERIC AS total_co2_kg,
           0 AS current_streak
         FROM host_profiles hp
         JOIN users u ON u.id = hp.user_id
         LEFT JOIN charger_listings cl ON cl.host_profile_id = hp.id
         LEFT JOIN reward_balances rb ON rb.user_id = u.id
         WHERE u.account_status = 'active'
         GROUP BY hp.id, u.id, rb.current_tier, rb.total_points
         ORDER BY hp.total_sessions_hosted DESC
         LIMIT 50`,
        [],
      )
      entries = res.rows
    } else if (tab === 'drivers') {
      const res = await db.execute(
        `SELECT
           RANK() OVER (ORDER BY dp.total_sessions DESC) AS rank,
           u.id AS user_id, u.full_name AS display_name, u.avatar_url,
           dp.total_sessions,
           dp.total_kwh_consumed AS total_kwh_delivered,
           rb.current_tier AS tier,
           0 AS is_superhost,
           COALESCE(rb.total_points / 100, 0) AS badge_count,
           0::NUMERIC AS total_co2_kg,
           0 AS current_streak
         FROM driver_profiles dp
         JOIN users u ON u.id = dp.user_id
         LEFT JOIN reward_balances rb ON rb.user_id = u.id
         WHERE u.account_status = 'active'
         ORDER BY dp.total_sessions DESC
         LIMIT 50`,
        [],
      )
      entries = res.rows
    } else {
      // Eco tab — CO₂ avoided
      const res = await db.execute(
        `SELECT
           RANK() OVER (ORDER BY co2.total_co2_kg DESC) AS rank,
           u.id AS user_id, u.full_name AS display_name, u.avatar_url,
           dp.total_sessions,
           dp.total_kwh_consumed AS total_kwh_delivered,
           co2.total_co2_kg,
           rb.current_tier AS tier,
           0 AS is_superhost,
           COALESCE(rb.total_points / 100, 0) AS badge_count,
           0 AS current_streak
         FROM driver_profiles dp
         JOIN users u ON u.id = dp.user_id
         JOIN LATERAL (
           SELECT ROUND((dp.total_kwh_consumed * 0.233)::NUMERIC, 1) AS total_co2_kg
         ) co2 ON TRUE
         LEFT JOIN reward_balances rb ON rb.user_id = u.id
         WHERE u.account_status = 'active' AND dp.total_kwh_consumed > 0
         ORDER BY co2.total_co2_kg DESC
         LIMIT 50`,
        [],
      )
      entries = res.rows
    }

    // User's own milestones (if authenticated)
    let milestones: unknown[] = []
    let userRank: number | null = null

    if (userId) {
      const badges = await db.execute(
        `SELECT badge_type, earned_at FROM reward_badges WHERE user_id = $1`,
        [userId],
      )
      const earnedSet = new Set((badges.rows as { badge_type: string }[]).map((b) => b.badge_type))
      const earnedAt  = new Map((badges.rows as { badge_type: string; earned_at: string }[]).map((b) => [b.badge_type, b.earned_at]))

      milestones = ECO_MILESTONES.map((m) => ({
        ...m,
        earned:   earnedSet.has(m.id),
        earnedAt: earnedAt.get(m.id) ?? null,
      }))

      // Find user's rank
      const userEntry = (entries as Array<{ user_id: string; rank: number }>).find((e) => e.user_id === userId)
      userRank = userEntry?.rank ?? null
    }

    return apiResponse({ entries, userRank, milestones })
  } catch (err) {
    console.error('[gamification/leaderboard]', err)
    return apiError('INTERNAL_ERROR', 'Could not load leaderboard', 500)
  }
}
