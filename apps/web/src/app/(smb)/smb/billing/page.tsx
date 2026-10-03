/**
 * @file page.tsx
 * @description /smb/billing — SMB subscription billing management.
 * Displays current plan, usage, and allows upgrade/downgrade between
 * Starter / Growth / Pro tiers.
 *
 * @module apps/web/app/(smb)/smb/billing
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, Loader2, AlertCircle, CreditCard, TrendingUp, Building2, Star, ArrowRight, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type PlanTier = 'starter' | 'growth' | 'pro'

type BillingStatus = {
  currentPlan: PlanTier
  status: 'active' | 'trialing' | 'past_due' | 'cancelled'
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  stripePortalUrl: string | null
  usage: {
    activeListings: number
    sessionsThisMonth: number
    revenueThisMonthPence: number
    apiCallsThisMonth: number
  }
}

/* ── Plan definitions ───────────────────────────────────────── */

const PLANS: Array<{
  tier: PlanTier
  name: string
  monthlyPence: number
  annualSavingPct: number
  commissionPct: number
  features: string[]
  highlight?: boolean
  icon: React.ReactNode
}> = [
  {
    tier: 'starter',
    name: 'Starter',
    monthlyPence: 0,
    annualSavingPct: 0,
    commissionPct: 15,
    icon: <Building2 className="h-5 w-5 text-gray-500" />,
    features: [
      'Up to 3 charger listings',
      '15% platform commission',
      'Basic earnings dashboard',
      'Email support',
      'Standard OCPP connectivity',
    ],
  },
  {
    tier: 'growth',
    name: 'Growth',
    monthlyPence: 2900,
    annualSavingPct: 17,
    commissionPct: 12,
    highlight: true,
    icon: <TrendingUp className="h-5 w-5 text-green-600" />,
    features: [
      'Up to 10 charger listings',
      '12% platform commission (save 3%)',
      'Revenue analytics + heatmap',
      'AI dynamic pricing suggestions',
      'CSV / XLSX data export',
      'QR code customer access',
      'Priority email support',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    monthlyPence: 7900,
    annualSavingPct: 20,
    commissionPct: 8,
    icon: <Star className="h-5 w-5 text-amber-500" />,
    features: [
      'Unlimited charger listings',
      '8% platform commission (save 7%)',
      'All Growth features',
      'White-label booking page',
      'Webhook API access',
      'VAT invoice generation',
      'Custom access controls & white-listing',
      'Dedicated account manager',
      'SLA: 4hr response time',
    ],
  },
]

/* ── API ─────────────────────────────────────────────────────── */

async function fetchBilling(): Promise<BillingStatus> {
  const res = await fetch('/api/v1/host/billing', { credentials: 'include' })
  const json = await res.json() as { data?: { billing: BillingStatus } }
  if (!json.data?.billing) throw new Error('Could not load billing')
  return json.data.billing
}

async function changePlan(tier: PlanTier): Promise<{ checkoutUrl: string }> {
  const res = await fetch('/api/v1/host/billing/change-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ tier }),
  })
  const json = await res.json() as {
    success: boolean
    data?: { checkoutUrl: string }
    error?: { message: string }
  }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to change plan')
  return { checkoutUrl: json.data!.checkoutUrl }
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  trialing:  'bg-blue-100 text-blue-700',
  past_due:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /smb/billing — SMB subscription billing management. */
export default function SmbBillingPage() {
  const [billing, setBilling]   = useState<BillingStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [changing, setChanging] = useState<PlanTier | null>(null)
  const [annual, setAnnual]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBilling(await fetchBilling())
    } catch {
      setError('Could not load billing information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleChangePlan = async (tier: PlanTier) => {
    if (tier === billing?.currentPlan) return
    setChanging(tier)
    try {
      const { checkoutUrl } = await changePlan(tier)
      window.location.href = checkoutUrl
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not change plan')
      setChanging(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  if (error || !billing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Subscription & Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your plan, view usage, and access invoices.</p>
      </div>

      {/* Current plan status */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold capitalize text-gray-900">
                {billing.currentPlan} Plan
              </span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', STATUS_COLORS[billing.status])}>
                {billing.status.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {billing.cancelAtPeriodEnd
                ? `Cancels on ${fmtDate(billing.currentPeriodEnd)}`
                : `Renews on ${fmtDate(billing.currentPeriodEnd)}`}
            </p>
          </div>
          {billing.stripePortalUrl && (
            <a
              href={billing.stripePortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <CreditCard className="h-4 w-4" />
              Manage billing
              <ExternalLink className="h-3.5 w-3.5 opacity-50" />
            </a>
          )}
        </div>

        {/* Usage */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UsageStat label="Active chargers" value={String(billing.usage.activeListings)} />
          <UsageStat label="Sessions this month" value={billing.usage.sessionsThisMonth.toLocaleString()} />
          <UsageStat label="Revenue this month" value={fmtPence(billing.usage.revenueThisMonthPence)} green />
          <UsageStat label="API calls" value={billing.usage.apiCallsThisMonth.toLocaleString()} />
        </div>
      </div>

      {/* Annual toggle */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <span className={cn('text-sm font-medium', !annual ? 'text-gray-900' : 'text-gray-400')}>Monthly</span>
        <button
          onClick={() => setAnnual((v) => !v)}
          className={cn('relative h-6 w-11 rounded-full transition-colors', annual ? 'bg-green-600' : 'bg-gray-300')}
          aria-pressed={annual}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', annual ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
        <span className={cn('text-sm font-medium', annual ? 'text-gray-900' : 'text-gray-400')}>
          Annual <span className="text-green-600 font-semibold">Save up to 20%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrentPlan = billing.currentPlan === plan.tier
          const displayPricePence = annual
            ? Math.round(plan.monthlyPence * 12 * (1 - plan.annualSavingPct / 100))
            : plan.monthlyPence
          const isChanging = changing === plan.tier

          return (
            <div
              key={plan.tier}
              className={cn(
                'relative rounded-2xl border-2 p-6 transition-shadow',
                plan.highlight
                  ? 'border-green-500 shadow-lg shadow-green-100'
                  : isCurrentPlan
                    ? 'border-green-500'
                    : 'border-gray-200 shadow-sm',
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-green-600 px-3 py-0.5 text-xs font-bold text-white">Most popular</span>
                </div>
              )}
              {isCurrentPlan && (
                <div className="absolute -top-3.5 right-4">
                  <span className="rounded-full bg-blue-600 px-3 py-0.5 text-xs font-bold text-white">Current plan</span>
                </div>
              )}

              <div className="mb-4 flex items-center gap-2">
                {plan.icon}
                <h3 className="text-lg font-extrabold text-gray-900">{plan.name}</h3>
              </div>

              <div className="mb-1">
                <span className="text-3xl font-extrabold text-gray-900">
                  {plan.monthlyPence === 0 ? 'Free' : `£${(displayPricePence / 100).toFixed(0)}`}
                </span>
                {plan.monthlyPence > 0 && (
                  <span className="ml-1 text-sm text-gray-500">/{annual ? 'year' : 'month'}</span>
                )}
              </div>
              {annual && plan.annualSavingPct > 0 && (
                <p className="mb-3 text-xs text-green-600 font-medium">Save {plan.annualSavingPct}% vs monthly</p>
              )}

              <p className="mb-4 text-sm text-gray-500">{plan.commissionPct}% commission on sessions</p>

              <ul className="mb-6 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => void handleChangePlan(plan.tier)}
                disabled={isCurrentPlan || isChanging !== null}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors',
                  isCurrentPlan
                    ? 'bg-gray-100 text-gray-500 cursor-default'
                    : plan.highlight
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  isChanging !== null && !isCurrentPlan && 'opacity-60 cursor-not-allowed',
                )}
              >
                {isChanging && changing === plan.tier ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                ) : isCurrentPlan ? (
                  'Current plan'
                ) : plan.monthlyPence > billing.currentPlan.length * 100 ? (
                  <><ArrowRight className="h-4 w-4" /> Upgrade</>
                ) : (
                  'Downgrade'
                )}
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        All prices exclude VAT. Switching plans takes effect at your next billing cycle. No long-term contracts.
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
