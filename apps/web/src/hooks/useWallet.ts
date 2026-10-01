/**
 * @file useWallet.ts
 * @description React hook for wallet balance and transaction history.
 *
 * @module apps/web/hooks
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

export type WalletBalance = {
  userId: string
  balancePence: number
  pendingPence: number
  autoTopupEnabled: boolean
  autoTopupThresholdPence: number
  autoTopupAmountPence: number
  updatedAt: string
}

export type WalletTransaction = {
  id: string
  type: string
  amountPence: number
  balanceAfterPence: number
  bookingId: string | null
  description: string
  createdAt: string
}

export function useWallet() {
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/wallet')
      if (res.ok) {
        const data = (await res.json()) as { data: WalletBalance }
        setBalance(data.data)
      }
    } catch {
      setError('Failed to load wallet')
    }
  }, [])

  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/wallet/history?page=${p}&pageSize=20`)
      if (res.ok) {
        const data = (await res.json()) as {
          data: { transactions: WalletTransaction[]; total: number }
        }
        setTransactions(p === 1 ? data.data.transactions : (prev) => [...prev, ...data.data.transactions])
        setTotal(data.data.total)
        setPage(p)
      }
    } catch {
      setError('Failed to load transaction history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBalance()
    void fetchHistory(1)
  }, [fetchBalance, fetchHistory])

  const topUp = useCallback(async (amountPence: number, paymentMethodId: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPence, paymentMethodId }),
      })
      if (res.ok) {
        await fetchBalance()
        await fetchHistory(1)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [fetchBalance, fetchHistory])

  const setAutoTopup = useCallback(async (
    enabled: boolean,
    thresholdPence: number,
    amountPence: number,
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/wallet/autotopup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, thresholdPence, amountPence }),
      })
      if (res.ok) {
        await fetchBalance()
        return true
      }
      return false
    } catch {
      return false
    }
  }, [fetchBalance])

  const loadMore = useCallback(() => {
    void fetchHistory(page + 1)
  }, [fetchHistory, page])

  const hasMore = transactions.length < total

  return {
    balance,
    transactions,
    total,
    loading,
    error,
    topUp,
    setAutoTopup,
    loadMore,
    hasMore,
    refetch: fetchBalance,
  }
}
