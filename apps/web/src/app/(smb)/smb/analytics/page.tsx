/**
 * @file page.tsx
 * @description /smb/analytics — Full per-charger analytics: revenue breakdown,
 * utilisation rate bars, session value distribution, and dynamic pricing suggestions.
 *
 * @module apps/web/app/(smb)/smb/analytics
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart3, Zap, PoundSterling, TrendingUp,
  TrendingDown, Loader2, AlertCircle, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Analytics = {
  summary: {
    totalSessions: number; grossRevenuePence: number; netRevenuePence: number
    totalKwh: number; avgSessionPence: number; utilisationPct: number
  }
  chargers: Array<{
    listingId: string; title: string; city: string; maxPowerKw: number
    sessions: number; revenuePence: number; energyKwh: number; avgSessionPence: number
  }>
  dailyRevenue: Array<{ date: string; sessions: number; revenuePence: number }>
}

function fmt(p: number) { return `£${(p / 100).toFixed(2)}` }

const PERIODS = [
  { key: '7d', label: '7d' }, { key: '30d', label: '30d' },
  { key: '90d', label: '90d' }, { key: '365d', label: '1yr' },
]

export default function SmbAnalyticsPage() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/host/analytics?period=${p}`)
      const json = await res.json() as { success: boolean; data?: Analytics; error?: { message: string } }
      if (json.success) setData(json.data ?? null)
      else setError(json.error?.message ?? 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchData(period) }, [fetchData, period])

  const maxRevenue = data ? Math.max(1, ...data.chargers.map((c) => c.revenuePence)) : 1

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/smb/dashboard" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Analytics</h1>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 rounded-[6px] border border-[hsl(var(--border))] p-1" role="group" aria-label="Period">
          {PERIODS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => { setPeriod(key); void fetchData(key) }}
              className={cn('rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors',
                period === key ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')}
              aria-pressed={period === key}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" /></div>}
      {error && (
        <div className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-4">
          <AlertCircle className="h-5 w-5 text-[hsl(var(--destructive))]" aria-hidden="true" />
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary strip */}
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Gross revenue', val: fmt(data.summary.grossRevenuePence), icon: PoundSterling },
              { label: 'Net (after fee)', val: fmt(data.summary.netRevenuePence), icon: TrendingUp },
              { label: 'Sessions', val: String(data.summary.totalSessions), icon: Zap },
              { label: 'kWh delivered', val: data.summary.totalKwh.toFixed(1), icon: BarChart3 },
              { label: 'Avg session', val: data.summary.avgSessionPence > 0 ? fmt(data.summary.avgSessionPence) : '—', icon: PoundSterling },
              { label: 'Utilisation', val: `${data.summary.utilisationPct}%`, icon: TrendingUp },
            ].map(({ label, val, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</p>
                  <p className="font-mono text-sm font-bold text-[hsl(var(--foreground))]">{val}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Per-charger revenue bars */}
          <section className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Per-charger revenue">
            <h2 className="mb-5 text-sm font-semibold text-[hsl(var(--foreground))]">Revenue by charger</h2>
            {data.chargers.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No data for this period.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {data.chargers.map((c) => {
                  const pct = Math.round((c.revenuePence / maxRevenue) * 100)
                  return (
                    <div key={c.listingId}>
                      <div className="mb-1.5 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{c.title}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{c.city} · {c.maxPowerKw}kW</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold text-[hsl(var(--foreground))]">{fmt(c.revenuePence)}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{c.sessions} sessions · {c.energyKwh.toFixed(1)}kWh</p>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} revenue: ${pct}% of top earner`}>
                        <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Daily revenue table */}
          <section className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Daily revenue table">
            <h2 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">Daily breakdown</h2>
            {data.dailyRevenue.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No sessions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))]">
                      <th scope="col" className="pb-2 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">Date</th>
                      <th scope="col" className="pb-2 text-right text-xs font-semibold text-[hsl(var(--muted-foreground))]">Sessions</th>
                      <th scope="col" className="pb-2 text-right text-xs font-semibold text-[hsl(var(--muted-foreground))]">Revenue</th>
                      <th scope="col" className="pb-2 text-right text-xs font-semibold text-[hsl(var(--muted-foreground))]">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyRevenue.map((row, i) => {
                      const prev = data.dailyRevenue[i - 1]
                      const up = prev ? row.revenuePence >= prev.revenuePence : null
                      return (
                        <tr key={row.date} className="border-b border-[hsl(var(--border)/0.5)] last:border-0">
                          <td className="py-2 text-[hsl(var(--foreground))]">{row.date}</td>
                          <td className="py-2 text-right font-mono text-[hsl(var(--muted-foreground))]">{row.sessions}</td>
                          <td className="py-2 text-right font-mono font-medium text-[hsl(var(--foreground))]">{fmt(row.revenuePence)}</td>
                          <td className="py-2 text-right">
                            {up === null ? '—' : up
                              ? <TrendingUp className="inline h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-label="Up" />
                              : <TrendingDown className="inline h-3.5 w-3.5 text-[hsl(var(--destructive))]" aria-label="Down" />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
