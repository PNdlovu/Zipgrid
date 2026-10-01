/**
 * @file page.tsx
 * @description /admin/dashboard — Platform KPIs: GMV, MAU, sessions/day,
 * listing health, open disputes, daily GMV sparkline.
 *
 * @module apps/web/app/(admin)/admin/dashboard
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  PoundSterling, Users, Zap, MessageSquareWarning,
  MapPin, TrendingUp, TrendingDown, Loader2, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Analytics = {
  period: { days: number; since: string }
  gmv: { totalPence: number; platformRevenuePence: number; deltaPct: number }
  sessions: { total: number; completed: number; faulted: number; deltaPct: number; faultRate: number }
  users: { total: number; newThisPeriod: number; mau: number }
  listings: { active: number; underReview: number; draft: number }
  disputes: { open: number }
  dailyGmv: Array<{ date: string; sessions: number; gmvPence: number }>
}

/* ── Helpers ────────────────────────────────────────────────── */

function fmt(p: number) { return `£${(p / 100).toFixed(0)}` }
function fmtFull(p: number) { return `£${(p / 100).toFixed(2)}` }

function Delta({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-[hsl(var(--muted-foreground))]">±0%</span>
  const up = pct > 0
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium', up ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]')}>
      {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(pct)}%
    </span>
  )
}

function KpiCard({ label, value, sub, delta, icon: Icon, accent, href }: {
  label: string; value: string; sub?: string; delta?: number
  icon: React.FC<{ className?: string }>; accent?: boolean; href?: string
}) {
  const content = (
    <div className={cn(
      'flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5',
      href && 'hover:border-[hsl(var(--primary)/0.4)] transition-colors',
    )}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-[6px]',
          accent ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]')}
          aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <div className="flex items-end gap-2">
          <p className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">{value}</p>
          {delta !== undefined && <Delta pct={delta} />}
        </div>
        {sub && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function GmvSparkline({ data }: { data: Array<{ date: string; gmvPence: number }> }) {
  if (data.length < 2) return <p className="text-xs text-[hsl(var(--muted-foreground))]">Not enough data yet</p>
  const max = Math.max(1, ...data.map((d) => d.gmvPence))
  const W = 400, H = 60
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - (d.gmvPence / max) * (H - 6)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Daily GMV chart">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${points} ${W},${H}`} fill="url(#ag)" />
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

const PERIODS = [{ key: '7', label: '7d' }, { key: '30', label: '30d' }, { key: '90', label: '90d' }]

export default function AdminDashboardPage() {
  const [days, setDays] = useState('30')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (d: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/admin/analytics?days=${d}`)
      const json = await res.json() as { success: boolean; data?: Analytics; error?: { message: string } }
      if (json.success) setData(json.data ?? null)
      else setError(json.error?.message ?? 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchData(days) }, [fetchData, days])

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Platform Overview</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">Live KPIs across all activity.</p>
        </div>
        <div className="flex gap-1 rounded-[6px] border border-[hsl(var(--border))] p-1" role="group" aria-label="Period">
          {PERIODS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => { setDays(key); void fetchData(key) }}
              className={cn('rounded-[4px] px-3 py-1.5 text-xs font-medium transition-colors',
                days === key ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')}
              aria-pressed={days === key}>{label}</button>
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
          {/* KPI grid */}
          <section aria-label="Platform KPIs">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Gross Merchandise Value" value={fmt(data.gmv.totalPence)} sub={`Platform revenue ${fmtFull(data.gmv.platformRevenuePence)}`} delta={data.gmv.deltaPct} icon={PoundSterling} accent />
              <KpiCard label="Sessions completed" value={String(data.sessions.completed)} sub={`Fault rate ${data.sessions.faultRate}%`} delta={data.sessions.deltaPct} icon={Zap} />
              <KpiCard label="Monthly active users" value={String(data.users.mau)} sub={`${data.users.newThisPeriod} new this period`} icon={Users} href="/admin/users" />
              <KpiCard label="Open disputes" value={String(data.disputes.open)} sub="Requires review" icon={MessageSquareWarning} accent={data.disputes.open > 0} href="/admin/disputes" />
            </div>
          </section>

          {/* Second row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* GMV sparkline */}
            <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="GMV over time">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Daily GMV</h2>
                <span className="font-mono text-sm font-bold text-[hsl(var(--primary))]">{fmtFull(data.gmv.totalPence)}</span>
              </div>
              <GmvSparkline data={data.dailyGmv} />
            </section>

            {/* Listing health + quick links */}
            <section className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5" aria-label="Listing health">
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Listing health</h2>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Active', value: data.listings.active, color: 'text-[hsl(var(--primary))]' },
                  { label: 'Under review', value: data.listings.underReview, color: 'text-yellow-600' },
                  { label: 'Draft', value: data.listings.draft, color: 'text-[hsl(var(--muted-foreground))]' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 rounded-[6px] border border-[hsl(var(--border))] py-4">
                    <span className={cn('font-mono text-2xl font-bold', color)}>{value}</span>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
                  </div>
                ))}
              </div>

              {/* Quick links */}
              <div className="flex flex-col gap-1.5 border-t border-[hsl(var(--border))] pt-3">
                {[
                  { href: '/admin/users', label: `${data.users.total.toLocaleString()} total users`, icon: Users },
                  { href: '/admin/listings', label: `${data.listings.underReview} listings need review`, icon: MapPin },
                  { href: '/admin/disputes', label: `${data.disputes.open} open dispute${data.disputes.open !== 1 ? 's' : ''}`, icon: MessageSquareWarning },
                ].map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] transition-colors">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
