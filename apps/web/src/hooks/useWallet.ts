/**
 * @file useWallet.ts
 * @description React hook for the driver wallet: balance, ledger history,
 * card top-ups (including 3-D Secure) and auto top-up settings.
 *
 * A top-up that succeeds immediately is credited by the API; after 3-D Secure
 * the Stripe webhook credits it, so the balance is polled briefly until it shows.
 *
 * @module apps/web/hooks
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'

export type WalletBalance = {
  userId: string
  balancePence: number
  pendingPence: number
  availablePence: number
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

type ApiEnvelope<T> = {
  success: boolean
  data?: T
  meta?: { total?: number }
  error?: { code: string; message: string }
}

const PAGE_SIZE = 20
const CREDIT_POLL_ATTEMPTS = 6
const CREDIT_POLL_INTERVAL_MS = 1500

export type TopUpResult = { ok: true } | { ok: false; error: string }

async function getJson<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, init)
  return (await res.json()) as ApiEnvelope<T>
}

/** Wallet balance, ledger, top-ups (incl. 3-D Secure) and auto top-up settings. */
export function useWallet() {
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [outstandingPence, setOutstandingPence] = useState(0)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBalance = useCallback(async (): Promise<WalletBalance | null> => {
    try {
      const json = await getJson<{ balance: WalletBalance; outstandingPence: number }>('/api/v1/wallet')
      if (!json.success || !json.data) throw new Error(json.error?.message)
      setBalance(json.data.balance)
      setOutstandingPence(json.data.outstandingPence ?? 0)
      return json.data.balance
    } catch {
      setError('Failed to load wallet')
      return null
    }
  }, [])

  const fetchHistory = useCallback(async (p: number) => {
    try {
      const json = await getJson<WalletTransaction[]>(`/api/v1/wallet/history?page=${p}&pageSize=${PAGE_SIZE}`)
      if (!json.success || !json.data) throw new Error(json.error?.message)
      const rows = json.data
      setTransactions((prev) => (p === 1 ? rows : [...prev, ...rows]))
      setTotal(json.meta?.total ?? 0)
      setPage(p)
    } catch {
      setError('Failed to load transaction history')
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([fetchBalance(), fetchHistory(1)])
  }, [fetchBalance, fetchHistory])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  /** Waits for the webhook to credit a top-up, then refreshes the ledger. */
  const awaitCredit = useCallback(async (previousBalance: number) => {
    for (let i = 0; i < CREDIT_POLL_ATTEMPTS; i++) {
      const b = await fetchBalance()
      if (b && b.balancePence > previousBalance) break
      await new Promise((r) => setTimeout(r, CREDIT_POLL_INTERVAL_MS))
    }
    await fetchHistory(1)
  }, [fetchBalance, fetchHistory])

  /** Charges a saved card. One idempotency key per attempt guards against double charges on retry. */
  const topUp = useCallback(async (amountPence: number, paymentMethodId: string): Promise<TopUpResult> => {
    const previousBalance = balance?.balancePence ?? 0
    try {
      const json = await getJson<{ status: string; clientSecret: string | null }>('/api/v1/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPence, paymentMethodId, idempotencyKey: crypto.randomUUID() }),
      })
      if (!json.success || !json.data) return { ok: false, error: json.error?.message ?? 'Top-up failed' }

      if (json.data.status === 'requires_action' && json.data.clientSecret) {
        const key = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
        const stripe = key ? await loadStripe(key) : null
        if (!stripe) return { ok: false, error: 'Card verification is unavailable. Please try another card.' }
        const { error: actionError } = await stripe.handleNextAction({ clientSecret: json.data.clientSecret })
        if (actionError) return { ok: false, error: actionError.message ?? 'Card verification failed' }
      }

      await awaitCredit(previousBalance)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Top-up failed. Check your connection and try again.' }
    }
  }, [balance, awaitCredit])

  const setAutoTopup = useCallback(async (
    enabled: boolean,
    thresholdPence: number,
    amountPence: number,
  ): Promise<TopUpResult> => {
    try {
      const json = await getJson<{ updated: boolean }>('/api/v1/wallet/autotopup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, thresholdPence, amountPence }),
      })
      if (!json.success) return { ok: false, error: json.error?.message ?? 'Could not save settings' }
      await fetchBalance()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not save settings. Check your connection.' }
    }
  }, [fetchBalance])

  const loadMore = useCallback(() => { void fetchHistory(page + 1) }, [fetchHistory, page])

  return {
    balance,
    outstandingPence,
    transactions,
    total,
    loading,
    error,
    hasMore: transactions.length < total,
    topUp,
    setAutoTopup,
    loadMore,
    refresh,
  }
}
