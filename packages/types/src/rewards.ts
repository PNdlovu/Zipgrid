/**
 * @file rewards.ts
 * @description Rewards and loyalty programme type definitions.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { RewardsTier } from './enums'

export type RewardsAccount = {
  userId: string
  points: number
  tier: RewardsTier
  tierUpdatedAt: Date
  lifetimePoints: number
}

export type RewardsTransaction = {
  id: string
  userId: string
  points: number
  direction: 'earned' | 'redeemed' | 'expired'
  reason: string
  referenceId: string | null
  createdAt: Date
}
