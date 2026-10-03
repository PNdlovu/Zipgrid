/**
 * @file page.tsx
 * @description /smb/billing — host plan (Starter / Growth / Pro), usage and
 * plan changes. Plans come from domains/billing/plans; plan state comes from
 * the host's Stripe subscription.
 *
 * @module apps/web/app/(smb)/smb/billing
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, Loader2, AlertCircle, CreditCard, TrendingUp, Building2, Star, ArrowRight, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLANS, PLAN_LIST, type BillingInterval, type PlanTier } from '@/domains/billing/plans'

/* ── Types ──────────────────────────────────────────────────── */

type BillingStatus = {
  currentPlan: PlanTier
  commissionPct: number
  status: string | null
  interval: BillingInterval | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripePortalUrl: string | null
  limits: { maxListings: number | null }
  usage: { listings: number; sessionsThisMonth: number; revenueThisMonthPence: number }
}

type ChangeResult =
  | { action: 'checkout'; checkoutUrl: string }
  | { action: 'updated'; tier: PlanTier }
  | { action: 'cancel_scheduled'; effectiveAt: string | null }
  | { action: 'resumed' }
  | { action: 'unchanged' }

const PLAN_ICONS: Record<PlanTier, React.ReactNode> = {
  starter: <Building2 className="h-5 w-5 text-gray-500" />,
  growth: <TrendingUp className="h-5 w-5 text-green-600" />,
  pro: <Star className="h-5 w-5 text-amber-500" />,
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  trialing: { label: 'Trial', className: 'bg-blue-100 text-blue-700' },
  past_due: { label: 'Payment overdue', className: 'bg-red-100 text-red-700' },
  canceled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500' },
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchBilling(): Promise<BillingStatus> {
  const res = await fetch('/api/v1/host/billing', { credentials: 'include' })
  const json = await res.json() as { data?: { billing: BillingStatus }; error?: { message: string } }
  if (!res.ok || !json.data?.billing) throw new Error(json.error?.message ?? 'Could not load billing')
  return json.data.billing
}

async function changePlan(tier: PlanTier, interval: BillingInterval): Promise<ChangeResult> {
  const res = await fetch('/api/v1/host/billing/change-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ tier, interval }),
  })
  const json = await res.json() as { success: boolean; data?: ChangeResult; error?: { message: string } }
  if (!res.ok || !json.success || !json.data) throw new Error(json.error?.message ?? 'Could not change plan')
  return json.data
}

/* ── Helpers ─────────────────────────────────────────────────── */

const fmtPence = (p: number) => `£${(p / 100).toFixed(2)}`
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /smb/billing — host plan, usage and plan changes. */
export default function SmbBillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [changing, setChanging] = useState<PlanTier | null>(null)
  const [annual, setAnnual] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const b = await fetchBilling()
      setBilling(b)
      setAnnual(b.interval === 'annual')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load billing information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get('checkout')
    if (checkout === 'success') setNotice('Payment received — your plan updates as soon as Stripe confirms it (usually within seconds).')
    if (checkout === 'cancelled') setNotice('Checkout cancelled — your plan has not changed.')
    void load()
  }, [load])

  const interval: BillingInterval = annual ? 'annual' : 'monthly'

  const handleChange = async (tier: PlanTier) => {
    setActionError(null)
    setNotice(null)
    setChanging(tier)
    try {
      const result = await changePlan(tier, interval)
      if (result.action === 'checkout') { window.location.href = result.checkoutUrl; return }
      if (result.action === 'cancel_scheduled') {
        setNotice(result.effectiveAt
          ? `Your plan stays active until ${fmtDate(result.effectiveAt)}, then moves to Starter.`
          : 'Your plan will move to Starter at the end of the billing period.')
      }
      if (result.action === 'updated') setNotice(`You're now on ${PLANS[result.tier].name}.`)
      if (result.action === 'resumed') setNotice('Cancellation withdrawn — your plan continues.')
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not change plan')
    } finally {
      setChanging(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" aria-label="Loading" />
      </div>
    )
  }

  if (loadError || !billing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      </div>
    )
  }

  const current = PLANS[billing.currentPlan]
  const status = billing.status ? STATUS_STYLES[billing.status] : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Subscription & Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your plan, view usage, and access invoices.</p>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{actionError}
        </p>
      )}

      {/* Current plan */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-gray-900">{current.name} plan</span>
              {status && (
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', status.className)}>{status.label}</span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {billing.commissionPct}% commission on sessions
              {billing.currentPeriodEnd && (billing.cancelAtPeriodEnd
                ? ` · ends ${fmtDate(billing.currentPeriodEnd)}, then Starter`
                : ` · renews ${fmtDate(billing.currentPeriodEnd)}${billing.interval ? ` (${billing.interval})` : ''}`)}
            </p>
            {billing.status === 'past_due' && (
              <p className="mt-1 text-sm text-red-600">Your last payment failed. Update your card in Manage billing to keep this plan.</p>
            )}
          </div>
          {billing.stripePortalUrl && (
            <a href={billing.stripePortalUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              <CreditCard className="h-4 w-4" /> Manage billing <ExternalLink className="h-3.5 w-3.5 opacity-50" />
            </a>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageStat label="Listings" value={billing.limits.maxListings === null ? String(billing.usage.listings) : `${billing.usage.listings} of ${billing.limits.maxListings}`} />
          <UsageStat label="Sessions this month" value={billing.usage.sessionsThisMonth.toLocaleString()} />
          <UsageStat label="Revenue this month" value={fmtPence(billing.usage.revenueThisMonthPence)} green />
        </div>
      </div>

      {/* Interval toggle */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <span className={cn('text-sm font-medium', !annual ? 'text-gray-900' : 'text-gray-400')}>Monthly</span>
        <button type="button" onClick={() => setAnnual((v) => !v)} role="switch" aria-checked={annual} aria-label="Bill annually"
          className={cn('relative h-6 w-11 rounded-full transition-colors', annual ? 'bg-green-600' : 'bg-gray-300')}>
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', annual ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
        <span className={cn('text-sm font-medium', annual ? 'text-gray-900' : 'text-gray-400')}>
          Annual <span className="font-semibold text-green-600">Save up to 20%</span>
        </span>
      </div>

      {/* Plans */}
      <div className="grid gap-6 sm:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const isCurrent = billing.currentPlan === plan.tier
          const sameInterval = plan.tier === 'starter' || billing.interval === interval
          const resumable = isCurrent && billing.cancelAtPeriodEnd && sameInterval && plan.tier !== 'starter'
          const disabled = changing !== null || (isCurrent && sameInterval && !resumable)
          const price = annual ? plan.annualPence : plan.monthlyPence
          const label = resumable ? 'Keep this plan'
            : isCurrent ? (sameInterval ? 'Current plan' : `Switch to ${interval}`)
            : plan.rank > current.rank ? 'Upgrade' : 'Downgrade'

          return (
            <div key={plan.tier} className={cn('relative rounded-2xl border-2 p-6',
              isCurrent ? 'border-green-500' : plan.tier === 'growth' ? 'border-green-300 shadow-lg shadow-green-100' : 'border-gray-200 shadow-sm')}>
              {isCurrent && (
                <span className="absolute -top-3.5 right-4 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-bold text-white">Current plan</span>
              )}
              <div className="mb-4 flex items-center gap-2">
                {PLAN_ICONS[plan.tier]}
                <h3 className="text-lg font-extrabold text-gray-900">{plan.name}</h3>
              </div>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-gray-900">{price === 0 ? 'Free' : `£${(price / 100).toFixed(0)}`}</span>
                {price > 0 && <span className="ml-1 text-sm text-gray-500">/{annual ? 'year' : 'month'}</span>}
              </div>
              <p className="mb-4 text-sm text-gray-500">{plan.commissionPct}% commission on sessions</p>
              <ul className="mb-6 space-y-2">
                {plan.highlights.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />{f}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void handleChange(plan.tier)} disabled={disabled}
                className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors',
                  disabled && !changing ? 'cursor-default bg-gray-100 text-gray-500'
                    : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-60')}>
                {changing === plan.tier ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                  : <>{label === 'Upgrade' && <ArrowRight className="h-4 w-4" />}{label}</>}
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Prices exclude VAT. Upgrades and plan switches apply immediately with a prorated charge; downgrades to
        Starter take effect at the end of the period you have paid for. Commission changes apply to new bookings.
      </p>
    </div>
  )
}

function UsageStat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold', green ? 'text-green-700' : 'text-gray-900')}>{value}</p>
    </div>
  )
}
