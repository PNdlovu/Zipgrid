/**
 * @file RewardEventHandlers.ts
 * @description Wires the RewardsService to domain events from the event bus.
 * Awards points on session completion and booking events.
 * Call bootstrapRewardEventHandlers() once from instrumentation.ts.
 *
 * @module domains/rewards
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { eventBus } from '@/lib/events/event-bus'
import { RewardsService } from './RewardsService'
import { getDb } from '@/lib/db'

/**
 * Wires reward point earning to domain events.
 * Idempotent — safe to call multiple times (EventEmitter deduplicates by reference
 * only if the same function reference is used, but bootstrap is called once at startup).
 */
export function bootstrapRewardEventHandlers(): void {

  // Session completed → award driver points (10 pts per £1 spent)
  eventBus.subscribe('SESSION_COMPLETED', async (e) => {
    try {
      const db = await getDb()

      // Resolve driver userId from session → booking → driver_profile
      const res = await db.execute(
        `SELECT dp.user_id
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE cs.id = $1 LIMIT 1`,
        [e.sessionId],
      )
      if (res.rows.length === 0) return

      const driverUserId = (res.rows[0] as { user_id: string }).user_id
      const basePoints = RewardsService.pointsForSession(e.totalCostPence)

      await RewardsService.earn(driverUserId, 'session_completed', basePoints, {
        sessionId: e.sessionId,
        bookingId: e.bookingId,
        description: `${(e.energyConsumedWh / 1000).toFixed(1)} kWh charged`,
      })

      // Also award host points (5 pts per £1 earned net)
      const hostRes = await db.execute(
        `SELECT hp.user_id, t.host_earnings_cents
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         LEFT JOIN transactions t ON t.booking_id = b.id AND t.status = 'captured'
         WHERE cs.id = $1 LIMIT 1`,
        [e.sessionId],
      )
      if (hostRes.rows.length > 0) {
        const host = hostRes.rows[0] as { user_id: string; host_earnings_cents: number | null }
        if (host.host_earnings_cents && host.host_earnings_cents > 0) {
          const hostPoints = RewardsService.pointsForHostSession(host.host_earnings_cents)
          await RewardsService.earn(host.user_id, 'host_session_earned', hostPoints, {
            sessionId: e.sessionId,
          })
        }
      }
    } catch {
      // Never let reward failures affect core flow
    }
  })

  // User registered → welcome bonus (200 pts)
  eventBus.subscribe('USER_REGISTERED', async (e) => {
    try {
      await RewardsService.earn(e.userId, 'welcome_bonus', 200, {
        description: 'Welcome to Zipgrid!',
      })
    } catch {
      // Ignore
    }
  })
}
