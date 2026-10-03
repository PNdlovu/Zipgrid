/**
 * @file page.tsx
 * @description /property — the buildings the driver lives at as a resident:
 * their bays, resident perks and what their bays have earned them.
 * Property managers manage buildings at /host/properties.
 *
 * @module apps/web/app/(driver)/property
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Loader2 } from 'lucide-react'
import type { Residency } from '@/domains/property/PropertyService'
import { pounds, propertyApi } from '@/components/property/api'
import { secondaryButton } from '@/components/property/PropertyForm'

const ACCESS_PERK: Record<Residency['accessMode'], string> = {
  residents_only: 'Bays here are reserved for residents.',
  residents_priority: 'You can book bays here further ahead than non-residents.',
  public: 'Bays here are open to all drivers.',
}

type Envelope<T> = { success: boolean; data?: T; error?: { message: string } }

/** Payout account status, with a Stripe onboarding link until payouts are enabled. */
function PayoutAccount() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v1/account/payouts', { credentials: 'include' })
      .then((res) => res.json() as Promise<Envelope<{ payoutsEnabled: boolean }>>)
      .then((j) => setEnabled(Boolean(j.data?.payoutsEnabled)))
      .catch(() => setEnabled(false))
  }, [])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/account/payouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPath: '/property', refreshPath: '/property' }),
      })
      const j = await res.json() as Envelope<{ onboardingUrl: string | null }>
      if (!j.success) throw new Error(j.error?.message ?? 'Could not start payout setup.')
      if (j.data?.onboardingUrl) window.location.href = j.data.onboardingUrl
      else setEnabled(true)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  if (enabled === null) return null
  if (enabled) return <p className="text-xs text-[hsl(var(--muted-foreground))]">Earnings are paid weekly to your payout account.</p>
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[hsl(var(--muted))] p-3 text-sm">
      <p>Set up a payout account to receive your earnings. They&apos;re held for you until you do.</p>
      {error && <p role="alert" className="text-[hsl(var(--destructive))]">{error}</p>}
      <div>
        <button type="button" className={secondaryButton} disabled={starting} onClick={() => void start()}>
          {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Set up payouts
        </button>
      </div>
    </div>
  )
}

/** Resident view of the driver's buildings. */
export default function MyBuildingPage() {
  const [residencies, setResidencies] = useState<Residency[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)

  const load = () =>
    propertyApi<{ residencies: Residency[] }>('/residencies')
      .then((d) => setResidencies(d.residencies))
      .catch((e: Error) => setError(e.message))

  useEffect(() => { void load() }, [])

  const leave = async (r: Residency) => {
    if (!confirm(`Leave ${r.propertyName}? Your bays will be unassigned. Earnings you already have stay yours.`)) return
    setLeaving(r.residentId)
    setError(null)
    try {
      await propertyApi(`/residencies/${r.residentId}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLeaving(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My building</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Charging where you live.</p>
      </div>

      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}

      {residencies === null && !error && (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
        </div>
      )}

      {residencies?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-[hsl(var(--border))] p-10 text-center">
          <Building2 className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" strokeWidth={1} aria-hidden="true" />
          <p className="font-semibold">You&apos;re not a resident anywhere yet</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            If your building uses Zipgrid, ask your property manager to invite you. The invite arrives by email.
          </p>
        </div>
      )}

      {residencies?.map((r) => (
        <section key={r.residentId} className="flex flex-col gap-4 rounded-lg border border-[hsl(var(--border))] p-5">
          <div>
            <h2 className="text-lg font-semibold">{r.propertyName}</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {r.unitNumber ? `${r.unitNumber}, ` : ''}{r.address}
            </p>
          </div>

          <ul className="flex flex-col gap-1 text-sm">
            <li>{ACCESS_PERK[r.accessMode]}</li>
            {r.residentDiscountPct > 0 && <li>You get {r.residentDiscountPct}% off charging here.</li>}
            {r.residentSharePct > 0 && <li>You earn {r.residentSharePct}% of what other drivers pay to use your bay.</li>}
          </ul>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Your bays</p>
            {r.bays.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No bay assigned to you yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {r.bays.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/listings/${b.listingId}`}
                      className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] px-4 py-3 text-sm transition-colors hover:bg-[hsl(var(--muted))]"
                    >
                      <span>{b.bayLabel ? `${b.bayLabel} · ` : ''}{b.listingTitle}</span>
                      <span className="text-[hsl(var(--primary))]">Book</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {r.residentSharePct > 0 && (
            <p className="text-sm">
              Earned from your bays: <span className="font-semibold">{pounds(r.earnedPence)}</span>
            </p>
          )}
          {r.residentSharePct > 0 && <PayoutAccount />}

          <div>
            <button type="button" className={secondaryButton} disabled={leaving === r.residentId} onClick={() => void leave(r)}>
              Leave building
            </button>
          </div>
        </section>
      ))}
    </div>
  )
}
