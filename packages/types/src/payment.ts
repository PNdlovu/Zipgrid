/**
 * @file payment.ts
 * @description Payment, wallet, and payout type definitions.
 * All monetary values in pence (integer). Never floats.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { PaymentStatus, TransactionType } from './enums'

export type Transaction = {
  id: string
  userId: string
  bookingId: string | null
  type: TransactionType
  status: PaymentStatus
  amountPence: number
  platformFeePence: number
  vatPence: number
  currency: string
  stripePaymentIntentId: string | null
  description: string
  createdAt: Date
}

export type Payout = {
  id: string
  hostId: string
  periodStart: Date
  periodEnd: Date
  grossEarningsPence: number
  platformCommissionPence: number
  vatOnCommissionPence: number
  netPayoutPence: number
  stripeTransferId: string | null
  status: 'pending' | 'processing' | 'paid' | 'failed'
  paidAt: Date | null
  createdAt: Date
}

export type WalletBalance = {
  userId: string
  balancePence: number
  pendingPence: number
  updatedAt: Date
}
