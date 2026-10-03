/**
 * @file usePaymentMethods.ts
 * @description Saved cards for the signed-in user: list, set default, remove,
 * and the SetupIntent used to add a card with Stripe Elements.
 *
 * @module apps/web/hooks
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

export type SavedCard = {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

type Envelope<T> = { success: boolean; data?: T; error?: { message: string } }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = (await res.json()) as Envelope<T>
  if (!res.ok || !json.success || json.data === undefined) throw new Error(json.error?.message ?? 'Request failed')
  return json.data
}

export function usePaymentMethods() {
  const [cards, setCards] = useState<SavedCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setCards(await call<SavedCard[]>('/api/v1/payments/methods'))
      setError(null)
    } catch (e) {
      setCards((prev) => prev ?? [])
      setError(e instanceof Error ? e.message : 'Could not load your cards')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  /** Client secret for a new SetupIntent (Stripe Elements, setup mode). */
  const createSetupIntent = useCallback(
    () => call<{ setupIntentId: string; clientSecret: string }>('/api/v1/payments/setup-intent', { method: 'POST' }),
    [],
  )

  const setDefault = useCallback(async (paymentMethodId: string) => {
    await call('/api/v1/payments/methods', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId }),
    })
    await refresh()
  }, [refresh])

  const remove = useCallback(async (paymentMethodId: string) => {
    await call(`/api/v1/payments/methods?pmId=${encodeURIComponent(paymentMethodId)}`, { method: 'DELETE' })
    await refresh()
  }, [refresh])

  const defaultCard = cards?.find((c) => c.isDefault) ?? cards?.[0] ?? null

  return { cards, defaultCard, error, refresh, createSetupIntent, setDefault, remove }
}
