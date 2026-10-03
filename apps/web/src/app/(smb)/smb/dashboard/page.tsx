/**
 * @file page.tsx
 * @description /smb/dashboard — SMB host overview: KPI cards, per-charger
 * status grid, revenue sparklines, peak-hours heatmap, and active sessions.
 *
 * @module apps/web/app/(smb)/smb/dashboard
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  PoundSterling, Zap, PlugZap, TrendingUp,
  BarChart3, ArrowRight, Loader2, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Analytics = {
  period: string
  summary: {
    totalSessions: number
    grossRevenuePence: number
    netRevenuePence: number
    totalKwh: number
    avgSessionPence: number
    utilisationPct: number
  }
  chargers: Array<{
    listingId: string; title: string; city: string
    maxPowerKw: number; sessions: number; revenuePence: number
  }>
  dailyRevenue: Array<{ date: string; sessions: number; revenuePence: number }>
  peakHoursHeatmap: Array<{ dayOfWeek: number; hourOfDay: number; sessionCount: number }>
}

/* ── Helpers ────────────────────────────────────────────────── */

function fmt(pence: number) { return `£${(pence / 100).toFixed(2)}` }

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ── Heatmap ────────────────────────────────────────────────── */

function PeakHeatmap({ data }: { data: Analytics['peakHoursHeatmap'] }) {
  const map = new Map(data.map((d) => [`${d.dayOfWeek}-${d.hourOfDay}`, d.sessionCount]))
  const maxCount = Math.max(1, ...data.map((d) => d.sessionCount))
  const HOURS = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {/* Hour labels */}
        <div className="mb-1 flex gap-0.5 pl-9">
          {HOURS.filter((h) => h % 3 === 0).map((h) => (
            <div key={h} className="w-[calc((100%-2rem)/8)] text-center text-[9px] text-[hsl(var(--muted-foreground))]">
              {h}:00
            </div>
          ))}
        </div>
        {/* Grid */}
        {[0,1,2,3,4,5,6].map((dow) => (
          <div key={dow} className="mb-0.5 flex items-center gap-0.5">
            <span className="w-8 shrink-0 text-right text-[9px] text-[hsl(var(--muted-foreground))]">{DAYS_SHORT[dow]}</span>
            {HOURS.map((h) => {
              const count = map.get(`${dow}-${h}`) ?? 0
              const intensity = count / maxCount
              return (
                <div
                  key={h}
                  title={`${DAYS_SHORT[dow]} ${h}:00 — ${count} session${count !== 1 ? 's' : ''}`}
                  className="flex-1 rounded-[2px] transition-colors"
                  style={{
                    height: 14,
                    backgroundColor: count === 0
                      ? 'hsl(var(--secondary))'
                      : `hsl(var(--primary) / ${0.15 + intensity * 0.85})`,
                  }}
                  aria-label={`${DAYS_SHORT[dow]} ${h}:00: ${count} sessions`}
                />
              )
            })}
          </div>
        ))}
        <div className="mt-1.5 flex items-center gap-2 text-[9px] text-[hsl(var(--muted-foreground))]">
          <span>Low</span>
          <div className="flex gap-0.5">
            {[0.1,0.3,0.5,0.7,0.9].map((o) => (
              <div key={o} className="h-2.5 w-4 rounded-[2px]" style={{ backgroundColor: `hsl(var(--primary) / ${o})` }} aria-hidden="true" />
            ))}
          </div>
          <span>High</span>
        </div>
      </div>
    </div>
  )
}

/* ── Revenue sparkline ───────────────────────────────────────── */

function Sparkline({ data }: { data: Array<{ date: string; revenuePence: number }> }) {
  if (data.length < 2) return <div className="h-12 text-xs text-[hsl(var(--muted-foreground))]">Not enough data yet</div>
  const max = Math.max(1, ...data.map((d) => d.revenuePence))
  const W = 300, H = 48
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - (d.revenuePence / max) * (H - 4)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Daily revenue chart" role="img">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${points} ${W},${H}`} fill="url(#sg)" />
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
    </svg>
  )
}

/* ── KPI card ────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string
  icon: React.FC<{ className?: string }>; accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-[6px]',
          accent ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]')}
          aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

const PERIODS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
]

/** Page at /smb/dashboard — SMB host overview: KPI cards, per-charger status grid, revenue sparklines, peak-hours heatmap, and active sessions. */
export default function SmbDashboardPage() {
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
      else setError(json.error?.message ?? 'Failed to load analytics')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchData(period) }, [fetchData, period])

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">SMB Overview</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">Multi-charger performance at a glance.</p>
        </div>
        <div className="flex gap-1 rounded-[6px] border border-[hsl(var(--border))] p-1" role="group" aria-label="Period selector">
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

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPI grid */}
          <section aria-label="Key metrics">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Net earnings" value={fmt(data.summary.netRevenuePence)} sub={`Gross ${fmt(data.summary.grossRevenuePence)}`} icon={PoundSterling} accent />
              <KpiCard label="Sessions" value={String(data.summary.totalSessions)} sub={`${data.summary.totalKwh.toFixed(1)} kWh delivered`} icon={Zap} />
              <KpiCard label="Utilisation" value={`${data.summary.utilisationPct}%`} sub="Avg across all chargers" icon={TrendingUp} />
              <KpiCard label="Avg session value" value={data.summary.avgSessionPence > 0 ? fmt(data.summary.avgSessionPence) : '—'} sub="Before platform fee" icon={BarChart3} />
            </div>
          </section>

          {/* Revenue chart + per-charger */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Sparkline */}
            <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Daily revenue">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Daily revenue</h2>
                <Link href="/smb/analytics" className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">Full breakdown →</Link>
              </div>
              <Sparkline data={data.dailyRevenue} />
            </section>

            {/* Per-charger table */}
            <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Per-charger performance">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Per-charger</h2>
                <Link href="/chargers" className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">Manage →</Link>
              </div>
              {data.chargers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <PlugZap className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No charger data yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.chargers.map((c) => (
                    <div key={c.listingId} className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] px-3 py-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)]" aria-hidden="true">
                        <Zap className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[hsl(var(--foreground))]">{c.title}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.city} · {c.maxPowerKw}kW</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">{fmt(c.revenuePence)}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.sessions} sessions</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Peak hours heatmap */}
          <section className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Peak usage heatmap">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Peak hours</h2>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">When drivers are most active across all your chargers</p>
              </div>
              <Link href="/smb/analytics" className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">
                Full analytics <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            {data.peakHoursHeatmap.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No session data for this period.</p>
            ) : (
              <PeakHeatmap data={data.peakHoursHeatmap} />
            )}
          </section>
        </>
      )}
    </div>
  )
}
