/**
 * @file RewardsService.ts
 * @description Rewards & loyalty service — earn points, redeem, tiers, badges.
 *
 * Point earn rates (base, before multipliers):
 *   Session completed (driver): 10 pts per £1 spent
 *   Host session earned:         5 pts per £1 earned
 *   Review submitted:           50 pts flat
 *   Referral friend:           500 pts flat
 *   Welcome bonus:             200 pts flat
 *   Streak bonus (4 weeks):    250 pts flat
 *
 * Tier thresholds (rolling 12-month points):
 *   Standard  0–999 pts    1.00× earn
 *   Silver    1,000–4,999  1.25× earn
 *   Gold      5,000–14,999 1.50× earn
 *   Platinum  15,000+      2.00× earn
 *
 * Redemption rate: 100 pts = £0.10 (configurable; hardcoded here)
 * Minimum redemption: 500 pts
 *
 * @module domains/rewards
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { ValidationError } from '@/lib/errors/AppError'
import { WalletService } from '@/domains/payments/WalletService'

/* ── Types ──────────────────────────────────────────────────── */

export type RewardBalance = {
  userId: string
  totalPoints: number
  lifetimePoints: number
  currentTier: 'standard' | 'silver' | 'gold' | 'platinum'
  tierQualifyingPts: number
  nextTierName: string | null
  nextTierPtsNeeded: number | null
  tierMultiplier: number
  walletEquivalentPence: number
}

export type Badge = {
  badgeType: string
  label: string
  description: string
  earnedAt: Date
}

/* ── Constants ───────────────────────────────────────────────── */

const REDEMPTION_RATE_PENCE_PER_100_PTS = 10  // 100 pts = £0.10
const MIN_REDEMPTION_PTS = 500

const TIER_THRESHOLDS = {
  standard: 0,
  silver: 1_000,
  gold: 5_000,
  platinum: 15_000,
} as const

const TIER_MULTIPLIERS: Record<string, number> = {
  standard: 1.00,
  silver: 1.25,
  gold: 1.50,
  platinum: 2.00,
}

const BADGE_META: Record<string, { label: string; description: string }> = {
  co2_100kg:       { label: '🌱 100kg CO₂ avoided', description: 'Prevented 100kg of CO₂ vs. a petrol car' },
  co2_500kg:       { label: '🌿 500kg CO₂ avoided', description: 'Prevented 500kg of CO₂' },
  co2_1000kg:      { label: '🌳 1 tonne CO₂ avoided', description: 'A full tonne of CO₂ prevented' },
  kwh_100:         { label: '⚡ 100 kWh charged', description: 'Your first 100 kilowatt-hours on Zipgrid' },
  kwh_500:         { label: '⚡⚡ 500 kWh charged', description: 'Five hundred kilowatt-hours and counting' },
  kwh_1000:        { label: '⚡⚡⚡ 1,000 kWh charged', description: 'A megawatt of electrons delivered' },
  kwh_10000:       { label: '🏆 10,000 kWh champion', description: 'Ten megawatt-hours — seriously impressive' },
  streak_4week:    { label: '🔥 4-week streak', description: 'Charged every week for a month straight' },
  emergency_host_3: { label: '🚨 Emergency hero', description: 'Rescued 3 drivers in emergency mode' },
  first_session:   { label: '🎉 First charge', description: 'Your first charging session on Zipgrid' },
  superhost:       { label: '⭐ Superhost', description: 'Maintained a 4.8+ rating for 30 sessions' },
}

/**
 * Rewards service.
 */
export const RewardsService = {

  // ── Balance ──────────────────────────────────────────────

  async getBalance(userId: string): Promise<RewardBalance> {
    const db = await getDb()

    // Upsert balance row
    await db.execute(
      `INSERT INTO reward_balances (user_id, total_points, lifetime_points, current_tier, tier_qualifying_pts, updated_at)
       VALUES ($1, 0, 0, 'standard', 0, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )

    const res = await db.execute(
      `SELECT user_id, total_points, lifetime_points, current_tier,
              tier_qualifying_pts, updated_at
       FROM reward_balances WHERE user_id = $1`,
      [userId],
    )

    const r = res.rows[0] as Record<string, unknown>
    return this._mapBalance(r)
  },

  // ── Earn ─────────────────────────────────────────────────

  /**
   * Awards points to a user for a given action.
   * Applies tier multiplier automatically.
   */
  async earn(
    userId: string,
    action: string,
    basePoints: number,
    options: { bookingId?: string; sessionId?: string; description?: string } = {},
  ): Promise<void> {
    const db = await getDb()
    const balance = await this.getBalance(userId)
    const multiplier = TIER_MULTIPLIERS[balance.currentTier] ?? 1.0

    // Special multipliers for off-peak and birthday can override
    const effectiveMultiplier = action === 'off_peak_bonus' ? 1.5
      : action === 'birthday_bonus' ? 2.0
      : multiplier

    const finalPoints = Math.round(basePoints * effectiveMultiplier)

    await db.execute(
      `INSERT INTO reward_points
         (user_id, action, points, multiplier, booking_id, session_id, description, expires_at, created_at)
       VALUES ($1, $2::reward_action, $3, $4, $5, $6, $7,
               NOW() + INTERVAL '12 months', NOW())`,
      [
        userId,
        action,
        finalPoints,
        effectiveMultiplier,
        options.bookingId ?? null,
        options.sessionId ?? null,
        options.description ?? action,
      ],
    )

    // Update tier_qualifying_pts (rolling 12-month window)
    await db.execute(
      `UPDATE reward_balances
       SET tier_qualifying_pts = tier_qualifying_pts + $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, finalPoints],
    )

    // Recalculate tier
    await this._recalculateTier(userId)

    // Check for badge unlocks
    await this._checkBadges(userId)
  },

  /**
   * Calculates points to earn for a completed session.
   * Driver: 10 pts per £1 spent.
   */
  pointsForSession(amountPence: number): number {
    return Math.floor(amountPence / 100) * 10  // 10 pts per £1
  },

  /**
   * Calculates points for a host's session earnings.
   * Host: 5 pts per £1 earned (net).
   */
  pointsForHostSession(netEarningsPence: number): number {
    return Math.floor(netEarningsPence / 100) * 5
  },

  // ── Redeem ────────────────────────────────────────────────

  /**
   * Redeems points as wallet credit.
   * Minimum 500 pts (= £0.50). Always multiples of 100 pts.
   * @throws {ValidationError} if insufficient points or below minimum
   */
  async redeem(userId: string, pointsToRedeem: number): Promise<{ walletCreditPence: number }> {
    if (pointsToRedeem < MIN_REDEMPTION_PTS) {
      throw new ValidationError(`Minimum redemption is ${MIN_REDEMPTION_PTS} points.`)
    }
    if (pointsToRedeem % 100 !== 0) {
      throw new ValidationError('Points must be redeemed in multiples of 100.')
    }

    const balance = await this.getBalance(userId)
    if (balance.totalPoints < pointsToRedeem) {
      throw new ValidationError(
        `Insufficient points. You have ${balance.totalPoints} pts, need ${pointsToRedeem}.`,
      )
    }

    const db = await getDb()
    const walletCreditPence = Math.floor(pointsToRedeem / 100) * REDEMPTION_RATE_PENCE_PER_100_PTS

    // Debit points ledger
    await db.execute(
      `INSERT INTO reward_points (user_id, action, points, multiplier, description, created_at)
       VALUES ($1, 'redemption', -$2, 1.0, $3, NOW())`,
      [userId, pointsToRedeem, `Redeemed ${pointsToRedeem} pts → £${(walletCreditPence / 100).toFixed(2)} wallet credit`],
    )

    // Credit wallet
    await WalletService.creditRewardRedemption(
      userId,
      walletCreditPence,
      `Reward redemption: ${pointsToRedeem} pts`,
    )

    return { walletCreditPence }
  },

  // ── Badges ────────────────────────────────────────────────

  async getBadges(userId: string): Promise<Badge[]> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT badge_type, earned_at FROM reward_badges WHERE user_id = $1 ORDER BY earned_at DESC`,
      [userId],
    )
    return res.rows.map((r) => {
      const row = r as { badge_type: string; earned_at: string }
      const meta = BADGE_META[row.badge_type] ?? { label: row.badge_type, description: '' }
      return { badgeType: row.badge_type, label: meta.label, description: meta.description, earnedAt: new Date(row.earned_at) }
    })
  },

  async awardBadge(userId: string, badgeType: string): Promise<void> {
    const db = await getDb()
    await db.execute(
      `INSERT INTO reward_badges (user_id, badge_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, badgeType],
    )
  },

  // ── Private ────────────────────────────────────────────────

  async _recalculateTier(userId: string): Promise<void> {
    const db = await getDb()

    // Sum qualifying points from last 12 months
    const res = await db.execute(
      `SELECT COALESCE(SUM(points), 0)::INT AS qualifying
       FROM reward_points
       WHERE user_id = $1 AND points > 0
         AND created_at >= NOW() - INTERVAL '12 months'`,
      [userId],
    )
    const qualifying = (res.rows[0] as { qualifying: number }).qualifying

    const tier =
      qualifying >= TIER_THRESHOLDS.platinum ? 'platinum'
      : qualifying >= TIER_THRESHOLDS.gold ? 'gold'
      : qualifying >= TIER_THRESHOLDS.silver ? 'silver'
      : 'standard'

    await db.execute(
      `UPDATE reward_balances
       SET current_tier = $2::reward_tier, tier_qualifying_pts = $3,
           tier_reviewed_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId, tier, qualifying],
    )
  },

  async _checkBadges(userId: string): Promise<void> {
    const db = await getDb()

    // Lifetime kWh consumed by this driver
    const kwhRes = await db.execute(
      `SELECT COALESCE(SUM(cs.energy_consumed_wh) / 1000.0, 0)::NUMERIC(10,2) AS total_kwh
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 AND cs.status = 'completed'`,
      [userId],
    )
    const totalKwh = Number((kwhRes.rows[0] as { total_kwh: string }).total_kwh)

    if (totalKwh >= 10000) await this.awardBadge(userId, 'kwh_10000')
    else if (totalKwh >= 1000) await this.awardBadge(userId, 'kwh_1000')
    else if (totalKwh >= 500) await this.awardBadge(userId, 'kwh_500')
    else if (totalKwh >= 100) await this.awardBadge(userId, 'kwh_100')

    // Check first session badge
    const sessionCount = await db.execute(
      `SELECT COUNT(*)::INT AS cnt
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 AND cs.status = 'completed'`,
      [userId],
    )
    if ((sessionCount.rows[0] as { cnt: number }).cnt >= 1) {
      await this.awardBadge(userId, 'first_session')
    }
  },

  _mapBalance(r: Record<string, unknown>): RewardBalance {
    const totalPts = Number(r['total_points'])
    const qualPts = Number(r['tier_qualifying_pts'])
    const tier = (r['current_tier'] as string) as RewardBalance['currentTier']

    const nextTierEntry =
      tier === 'standard' ? { name: 'Silver', threshold: TIER_THRESHOLDS.silver }
      : tier === 'silver' ? { name: 'Gold', threshold: TIER_THRESHOLDS.gold }
      : tier === 'gold' ? { name: 'Platinum', threshold: TIER_THRESHOLDS.platinum }
      : null

    return {
      userId: r['user_id'] as string,
      totalPoints: totalPts,
      lifetimePoints: Number(r['lifetime_points']),
      currentTier: tier,
      tierQualifyingPts: qualPts,
      nextTierName: nextTierEntry?.name ?? null,
      nextTierPtsNeeded: nextTierEntry ? Math.max(0, nextTierEntry.threshold - qualPts) : null,
      tierMultiplier: TIER_MULTIPLIERS[tier] ?? 1.0,
      walletEquivalentPence: Math.floor(totalPts / 100) * REDEMPTION_RATE_PENCE_PER_100_PTS,
    }
  },
}
