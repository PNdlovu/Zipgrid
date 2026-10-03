/**
 * @file page.tsx
 * @description /host/earnings — Host earnings overview.
 * Period selector, net/gross breakdown, per-listing chart, payout history.
 *
 * @module apps/web/app/(host)/earnings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PoundSterling, TrendingUp, Zap, CalendarDays,
  RefreshCw, ArrowUpRight, ArrowDownRight, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type Period = '7d' | '30d' | '90d' | '365d'

type EarningsSummary = {
  period: string
  sessionCount: number
  grossEarningsPence: number
  platformFeePence: number
  netEarningsPence: number
  totalKwh: number
  avgSessionPence: number
}

type PayoutBatch = {
  id: string
  periodStart: string
  periodEnd: string
  netEarningsPence: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processedAt: string | null
  stripeTransferId: string | null
}

type ChargerBreakdown = {
  listingId: string
  title: string
  city: string
  sessions: number
  revenuePence: number
  energyKwh: number
}

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d',   label: '7 days' },
  { key: '30d',  label: '30 days' },
  { key: '90d',  label: '3 months' },
  { key: '365d', label: '1 year' },
]

const PERIOD_TO_API: Record<Period, string> = {
  '7d':   'this_week',
  '30d':  'this_month',
  '90d':  'last_month',
  '365d': 'all_time',
}

/* ── Helpers ─────────────────────────────────────────────── */

function fmt(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_CONFIG = {
  pending:    { label: 'Pending',    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  processing: { label: 'Processing', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  completed:  { label: 'Paid',       cls: 'bg-[hsl(var(--primary)_/_10%)] text-[hsl(var(--primary))]' },
  failed:     { label: 'Failed',     cls: 'bg-[hsl(var(--destructive)_/_10%)] text-[hsl(var(--destructive))]' },
}

/* ── Stat card ────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-[6px]', accent ? 'bg-[hsl(var(--primary)_/_12%)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]')} aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="font-mono text-2xl font-bold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */

/** Page at /earnings — Host earnings overview. */
export default function HostEarningsPage() {
  const [period, setPeriod]     = useState<Period>('30d')
  const [summary, setSummary]   = useState<EarningsSummary | null>(null)
  const [payouts, setPayouts]   = useState<PayoutBatch[]>([])
  const [chargers, setChargers] = useState<ChargerBreakdown[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const [earningsRes, analyticsRes, payoutsRes] = await Promise.allSettled([
        fetch(`/api/v1/host/earnings?period=${PERIOD_TO_API[p]}`),
        fetch(`/api/v1/host/analytics?period=${p}`),
        fetch('/api/v1/host/payouts?pageSize=50'),
      ])

      if (earningsRes.status === 'fulfilled' && earningsRes.value.ok) {
        const d = (await earningsRes.value.json()) as { data: EarningsSummary }
        setSummary(d.data)
      }

      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
        const d = (await analyticsRes.value.json()) as {
          data: { chargers: ChargerBreakdown[] }
        }
        setChargers(d.data.chargers ?? [])
      }

      if (payoutsRes.status === 'fulfilled' && payoutsRes.value.ok) {
        const d = (await payoutsRes.value.json()) as {
          data: { batches: PayoutBatch[] }
        }
        setPayouts(d.data.batches ?? [])
      }
    } catch {
      setError('Failed to load earnings data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData(period) }, [fetchData, period])

  const netPct = summary && summary.grossEarningsPence > 0
    ? Math.round((summary.netEarningsPence / summary.grossEarningsPence) * 100)
    : 85

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Earnings</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Your net income after Zipgrid&apos;s 15% fee
          </p>
        </div>
        {/* Period selector */}
        <div role="group" aria-label="Time period" className="flex rounded-[6px] border border-[hsl(var(--border))] overflow-hidden">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                period === key
                  ? 'bg-[hsl(var(--primary))] text-white'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]',
              )}
              aria-pressed={period === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-[6px] border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Net earnings"
              value={fmt(summary?.netEarningsPence ?? 0)}
              sub={`${netPct}% of gross after fee`}
              icon={PoundSterling}
              accent
            />
            <StatCard
              label="Gross revenue"
              value={fmt(summary?.grossEarningsPence ?? 0)}
              sub={`Platform fee: ${fmt(summary?.platformFeePence ?? 0)}`}
              icon={TrendingUp}
            />
            <StatCard
              label="Sessions"
              value={String(summary?.sessionCount ?? 0)}
              {...(summary?.avgSessionPence ? { sub: `Avg ${fmt(summary.avgSessionPence)} per session` } : {})}
              icon={CalendarDays}
            />
            <StatCard
              label="Energy delivered"
              value={`${(summary?.totalKwh ?? 0).toFixed(1)} kWh`}
              sub="Total across all sessions"
              icon={Zap}
            />
          </div>

          {/* Per-charger breakdown */}
          {chargers.length > 0 && (
            <section className="mb-6" aria-label="Per-charger breakdown">
              <h2 className="mb-3 text-base font-semibold">By charger</h2>
              <div className="overflow-hidden rounded-[6px] border border-[hsl(var(--border))]">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(var(--muted))]">
                    <tr>
                      {['Charger', 'Sessions', 'Revenue', 'Energy'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {chargers.map((c) => (
                      <tr key={c.listingId} className="hover:bg-[hsl(var(--muted)_/_50%)]">
                        <td className="px-4 py-3">
                          <p className="font-medium">{c.title}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{c.city}</p>
                        </td>
                        <td className="px-4 py-3 text-center">{c.sessions}</td>
                        <td className="px-4 py-3 font-medium text-[hsl(var(--primary))]">{fmt(c.revenuePence)}</td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{c.energyKwh.toFixed(1)} kWh</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Payout history */}
          <section aria-label="Payout history">
            <h2 className="mb-3 text-base font-semibold">Payout history</h2>
            {payouts.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-[hsl(var(--border))] py-10 text-center">
                <Clock className="mx-auto h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">No payouts yet</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Payouts are processed every Monday for the previous week.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[hsl(var(--border))] rounded-[6px] border border-[hsl(var(--border))]">
                {payouts.map((p) => {
                  const cfg = STATUS_CONFIG[p.status]
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                        </p>
                        {p.processedAt && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            Paid {fmtDate(p.processedAt)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg?.cls)}>
                          {cfg?.label}
                        </span>
                        <span className="font-mono text-sm font-semibold">
                          {fmt(p.netEarningsPence)}
                        </span>
                        {p.status === 'completed' ? (
                          <ArrowUpRight className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
                        ) : p.status === 'failed' ? (
                          <ArrowDownRight className="h-4 w-4 text-[hsl(var(--destructive))]" aria-hidden="true" />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
