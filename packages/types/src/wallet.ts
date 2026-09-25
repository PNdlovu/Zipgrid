/**
 * @file wallet.ts
 * @description Zipgrid wallet type definitions.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export type WalletTransaction = {
  id: string
  userId: string
  amountPence: number
  /** Positive = credit, negative = debit */
  direction: 'credit' | 'debit'
  type: 'topup' | 'spend' | 'refund' | 'reward_redemption'
  referenceId: string | null
  description: string
  balanceAfterPence: number
  createdAt: Date
}
