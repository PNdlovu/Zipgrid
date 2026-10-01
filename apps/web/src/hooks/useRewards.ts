/**
 * @file useRewards.ts
 * @description React hook for rewards balance, tier status, and badge collection.
 *
 * @module apps/web/hooks
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

export type RewardsTier = 'standard' | 'silver' | 'gold' | 'platinum'

export type RewardsBalance = {
  userId: string
  totalPoints: number
  lifetimePoints: number
  currentTier: RewardsTier
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
  earnedAt: string
}

export function useRewards() {
  const [balance, setBalance] = useState<RewardsBalance | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [balRes, badgesRes] = await Promise.all([
        fetch('/api/v1/rewards'),
        fetch('/api/v1/rewards/badges'),
      ])
      if (balRes.ok) {
        const data = (await balRes.json()) as { data: RewardsBalance }
        setBalance(data.data)
      }
      if (badgesRes.ok) {
        const data = (await badgesRes.json()) as { data: Badge[] }
        setBadges(data.data)
      }
    } catch {
      setError('Failed to load rewards')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBalance()
  }, [fetchBalance])

  const redeem = useCallback(async (points: number): Promise<boolean> => {
    setRedeeming(true)
    setRedeemError(null)
    setRedeemSuccess(null)
    try {
      const res = await fetch('/api/v1/rewards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      })
      if (res.ok) {
        const data = (await res.json()) as { data: { walletCreditPence: number } }
        const credit = (data.data.walletCreditPence / 100).toFixed(2)
        setRedeemSuccess(`£${credit} added to your wallet.`)
        await fetchBalance()
        return true
      }
      const body = (await res.json()) as { error?: { message?: string } }
      setRedeemError(body.error?.message ?? 'Redemption failed')
      return false
    } catch {
      setRedeemError('Network error — please try again')
      return false
    } finally {
      setRedeeming(false)
    }
  }, [fetchBalance])

  /** Tier progress as a 0–1 fraction */
  const tierProgress = balance
    ? balance.nextTierPtsNeeded != null && balance.nextTierPtsNeeded > 0
      ? 1 - balance.nextTierPtsNeeded / tierTotal(balance.currentTier)
      : 1
    : 0

  return {
    balance,
    badges,
    loading,
    redeeming,
    error,
    redeemError,
    redeemSuccess,
    redeem,
    tierProgress,
    refetch: fetchBalance,
  }
}

/**
 * Points needed to go from zero to max of current tier (used for progress %).
 */
function tierTotal(tier: RewardsTier): number {
  switch (tier) {
    case 'standard': return 1_000
    case 'silver':   return 5_000
    case 'gold':     return 15_000
    case 'platinum': return 15_000
  }
}
