/**
 * @file page.tsx
 * @description Host dashboard — live earnings, session activity, charger status.
 * Client component: fetches from /api/v1/host/analytics, /api/v1/host/listings,
 * /api/v1/chargers, and /api/v1/sessions?role=host on mount.
 *
 * @module apps/web/app/(host)/dashboard
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PoundSterling, Zap, PlugZap, CalendarCheck,
  TrendingUp, AlertTriangle, Plus, ArrowRight, CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Dashboard — Zipgrid Host',
}

/* ── Types ───────────────────────────────────────────────── */

type AnalyticsSummary = {
  totalSessions: number
  grossRevenuePence: number
  netRevenuePence: number
  totalKwh: number
  avgSessionPence: number
  utilisationPct: number
}

type RecentSession = {
  id: string
  status: string
  listingTitle: string | null
  listingCity: string | null
  totalCostPence: number
  energyConsumedWh: number
  startedAt: string | null
  endedAt: string | null
  driverName: string | null
}

type ChargerSummary = {
  id: string
  chargePointId: string
  brand: string | null
  model: string | null
  status: string
  isConnected: boolean
  activeSessionCount: number
}

type SetupStep = { label: string; href: string; done: boolean }

/* ── Stat card ───────────────────────────────────────────── */

function StatCard({
  label, value, sub, icon: Icon, accent, loading,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent?: boolean
  loading?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-[6px]',
            accent
              ? 'bg-[hsl(var(--primary)_/_12%)] text-[hsl(var(--primary))]'
              : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]',
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded bg-[hsl(var(--muted))]" />
        ) : (
          <p className="font-mono text-3xl font-bold text-[hsl(var(--foreground))]">{value}</p>
        )}
        {sub && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */

function fmt(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  }) + ' ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ── Page ────────────────────────────────────────────────── */

export default function HostDashboardPage() {
  const [analytics, setAnalytics]       = useState<AnalyticsSummary | null>(null)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [chargers, setChargers]         = useState<ChargerSummary[]>([])
  const [setupSteps, setSetupSteps]     = useState<SetupStep[]>([])
  const [loading, setLoading]           = useState(true)
  const [activeCount, setActiveCount]   = useState(0)

  const fetchAll = useCallback(async () => {
    try {
      const [analyticsRes, sessionsRes, chargersRes, listingsRes] = await Promise.allSettled([
        fetch('/api/v1/host/analytics?period=30d'),
        fetch('/api/v1/sessions?role=host&pageSize=5&status=completed,charging,preparing'),
        fetch('/api/v1/chargers'),
        fetch('/api/v1/host/listings?pageSize=1'),
      ])

      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
        const d = (await analyticsRes.value.json()) as { data: { summary: AnalyticsSummary } }
        setAnalytics(d.data.summary)
      }

      if (sessionsRes.status === 'fulfilled' && sessionsRes.value.ok) {
        const d = (await sessionsRes.value.json()) as { data: { sessions: RecentSession[] } }
        setRecentSessions(d.data.sessions ?? [])
        setActiveCount(d.data.sessions?.filter((s) => s.status === 'charging' || s.status === 'preparing').length ?? 0)
      }

      if (chargersRes.status === 'fulfilled' && chargersRes.value.ok) {
        const d = (await chargersRes.value.json()) as { data: ChargerSummary[] }
        setChargers(d.data ?? [])
      }

      // Build setup checklist from real data
      const hasListing = listingsRes.status === 'fulfilled' && listingsRes.value.ok
        && ((await listingsRes.value.json()) as { meta: { total: number } }).meta?.total > 0
      const hasCharger = chargers.length > 0

      setSetupSteps([
        { label: 'Pair your smart charger',        href: '/host/chargers/pair',    done: hasCharger },
        { label: 'Create your first listing',       href: '/host/listings/new',     done: hasListing },
        { label: 'Set your availability schedule',  href: '/host/listings',         done: hasListing },
        { label: 'Connect your bank account',       href: '/host/settings/payout',  done: false },
      ])
    } finally {
      setLoading(false)
    }
  }, [chargers.length])

  useEffect(() => {
    void fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isNewHost = !loading && (analytics?.totalSessions ?? 0) === 0 && chargers.length === 0
  const pendingSteps = setupSteps.filter((s) => !s.done)

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Dashboard</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {loading
              ? 'Loading your data…'
              : `${activeCount > 0 ? `${activeCount} active session${activeCount !== 1 ? 's' : ''} · ` : ''}Last 30 days`}
          </p>
        </div>
        <Link
          href="/listings/new"
          className="flex h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add listing
        </Link>
      </div>

      {/* Onboarding banner — only for new hosts */}
      {isNewHost && (
        <div
          className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--primary)_/_30%)] bg-[hsl(var(--primary)_/_5%)] p-6 sm:flex-row sm:items-center"
          role="region"
          aria-label="Getting started guide"
        >
          <Zap className="h-8 w-8 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-semibold">Get your first listing live in 10 minutes</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Pair your charger, set your price, and start earning. Most hosts are live in under 10 minutes.
            </p>
          </div>
          <Link
            href="/listings/new"
            className="flex shrink-0 h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
          >
            Create listing <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <section aria-label="Earnings statistics — last 30 days">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Last 30 days
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Net earnings"
            value={analytics ? fmt(analytics.netRevenuePence) : '£0.00'}
            sub="After 15% platform fee"
            icon={PoundSterling}
            accent
            loading={loading}
          />
          <StatCard
            label="Sessions"
            value={analytics ? String(analytics.totalSessions) : '0'}
            sub={activeCount > 0 ? `${activeCount} active right now` : 'None active'}
            icon={Zap}
            loading={loading}
          />
          <StatCard
            label="Chargers"
            value={String(chargers.length)}
            sub={chargers.filter((c) => c.isConnected).length + ' online'}
            icon={PlugZap}
            loading={loading}
          />
          <StatCard
            label="Utilisation"
            value={analytics ? `${analytics.utilisationPct}%` : '—'}
            sub="Of available hours used"
            icon={TrendingUp}
            loading={loading}
          />
        </div>
      </section>

      {/* Two-column lower section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent sessions */}
        <section
          className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          aria-label="Recent sessions"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent sessions</h2>
            <Link href="/sessions" className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <RefreshCw className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CalendarCheck className="h-8 w-8 text-[hsl(var(--muted-foreground)_/_40%)]" aria-hidden="true" strokeWidth={1} />
              <div>
                <p className="text-sm font-medium">No sessions yet</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  Sessions appear here once drivers start booking.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Session list">
              {recentSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.listingTitle ?? '—'}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {fmtDate(s.startedAt)} · {(s.energyConsumedWh / 1000).toFixed(1)} kWh
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[hsl(var(--primary))]">
                    {fmt(Math.round(s.totalCostPence * 0.85))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Charger status */}
        <section
          className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          aria-label="Charger status"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Charger status</h2>
            <Link href="/chargers" className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">
              Manage →
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <RefreshCw className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
            </div>
          ) : chargers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <PlugZap className="h-8 w-8 text-[hsl(var(--muted-foreground)_/_40%)]" aria-hidden="true" strokeWidth={1} />
              <div>
                <p className="text-sm font-medium">No chargers paired</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  Pair your smart charger for remote start/stop and live telemetry.
                </p>
              </div>
              <Link
                href="/chargers/pair"
                className="mt-1 flex h-8 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-3 text-xs font-medium hover:border-[hsl(var(--primary)_/_40%)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Pair a charger
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Charger list">
              {chargers.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        c.isConnected ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]',
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.brand && c.model ? `${c.brand} ${c.model}` : c.chargePointId}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">
                        {c.isConnected ? 'Online' : 'Offline'} · {c.status}
                        {c.activeSessionCount > 0 && ` · ${c.activeSessionCount} charging`}
                      </p>
                    </div>
                  </div>
                  {c.status === 'faulted' && (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" aria-label="Faulted" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Setup checklist — shown when there are incomplete steps */}
      {pendingSteps.length > 0 && (
        <section
          className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          aria-label="Host setup checklist"
        >
          <h2 className="mb-4 text-base font-semibold">Getting started</h2>
          <ol role="list" className="flex flex-col gap-3">
            {setupSteps.map(({ label, href, done }) => (
              <li key={label} className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                ) : (
                  <div className="h-5 w-5 shrink-0 rounded-full border-2 border-[hsl(var(--border))]" aria-hidden="true" />
                )}
                <Link
                  href={href}
                  className={cn(
                    'text-sm transition-colors hover:text-[hsl(var(--primary))]',
                    done ? 'text-[hsl(var(--muted-foreground))] line-through' : 'text-[hsl(var(--foreground))]',
                  )}
                >
                  {label}
                </Link>
                {!done && (
                  <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground)_/_50%)]" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
