/**
 * @file rewards.ts
 * @description TanStack Query hooks for the rewards and loyalty programme.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { RewardsAccount } from '@zipgrid/types'
import { apiClient } from './client'

type Badge = {
  badgeType: string
  label: string
  description: string
  earnedAt: string
}

type RewardsBalance = RewardsAccount & {
  tierQualifyingPts: number
  nextTierName: string | null
  nextTierPtsNeeded: number | null
  tierMultiplier: number
  walletEquivalentPence: number
}

type RedeemResult = {
  walletCreditPence: number
}

export const rewardsKeys = {
  all: ['rewards'] as const,
  balance: () => ['rewards', 'balance'] as const,
  badges: () => ['rewards', 'badges'] as const,
}

/** Fetches rewards balance and tier status */
export function useRewardsBalance() {
  return useQuery({
    queryKey: rewardsKeys.balance(),
    queryFn: () => apiClient.get<RewardsBalance>('/v1/rewards'),
    staleTime: 60_000,
  })
}

/** Fetches earned badges */
export function useRewardsBadges() {
  return useQuery({
    queryKey: rewardsKeys.badges(),
    queryFn: () => apiClient.get<Badge[]>('/v1/rewards/badges'),
    staleTime: 120_000,
  })
}

/** Mutation to redeem points for wallet credit */
export function useRedeemPoints() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (points: number) =>
      apiClient.post<RedeemResult>('/v1/rewards/redeem', { points }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rewardsKeys.all })
    },
  })
}
