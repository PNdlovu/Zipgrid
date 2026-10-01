/**
 * @file wallet.ts
 * @description TanStack Query hooks for wallet balance and transactions.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WalletTransaction } from '@zipgrid/types'
import { apiClient } from './client'

type WalletBalance = {
  userId: string
  balancePence: number
  pendingPence: number
  autoTopupEnabled: boolean
  autoTopupThresholdPence: number
  autoTopupAmountPence: number
  updatedAt: string
}

type WalletHistoryResponse = {
  transactions: WalletTransaction[]
  total: number
}

export const walletKeys = {
  all: ['wallet'] as const,
  balance: () => ['wallet', 'balance'] as const,
  history: (page: number) => ['wallet', 'history', page] as const,
}

/** Fetches the current wallet balance */
export function useWalletBalance() {
  return useQuery({
    queryKey: walletKeys.balance(),
    queryFn: () => apiClient.get<WalletBalance>('/v1/wallet'),
    staleTime: 10_000,
  })
}

/** Fetches paginated transaction history */
export function useWalletHistory(page = 1) {
  return useQuery({
    queryKey: walletKeys.history(page),
    queryFn: () =>
      apiClient.get<WalletHistoryResponse>('/v1/wallet/history', {
        params: { page, pageSize: 20 },
      }),
    staleTime: 30_000,
  })
}

/** Mutation to top up the wallet */
export function useTopUpWallet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { amountPence: number; paymentMethodId: string }) =>
      apiClient.post<WalletBalance>('/v1/wallet/topup', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all })
    },
  })
}

/** Mutation to update auto top-up settings */
export function useSetAutoTopup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { enabled: boolean; thresholdPence: number; amountPence: number }) =>
      apiClient.patch<WalletBalance>('/v1/wallet/autotopup', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.balance() })
    },
  })
}
