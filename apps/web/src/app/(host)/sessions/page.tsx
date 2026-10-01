/**
 * @file page.tsx
 * @description /host/sessions — host's charging session history.
 * Shows all sessions across all listings with status, energy, revenue,
 * and per-session actions (view details, contact driver).
 *
 * @module apps/web/app/(host)/sessions
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Zap, Clock, PoundSterling, BatteryCharging,
  ChevronRight, Filter, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type SessionStatus = 'preparing' | 'charging' | 'paused' | 'finishing' | 'completed' | 'faulted'

type HostSession = {
  id: string
  status: SessionStatus
  chargePointId: string
  energyConsumedWh: number
  totalCostPence: number
  durationMinutes: number | null
  startedAt: string | null
  endedAt: string | null
  listingTitle: string | null
  listingCity: string | null
  driverName: string | null
}

type SessionsResponse = {
  sessions: HostSession[]
  total: number
}

/* ── Helpers ─────────────────────────────────────────────── */

const STATUS_CONFIG: Record<SessionStatus, { label: string; dot: string }> = {
  preparing: { label: 'Preparing',  dot: 'bg-amber-400' },
  charging:  { label: 'Charging',   dot: 'bg-[hsl(var(--primary))]' },
  paused:    { label: 'Paused',     dot: 'bg-yellow-500' },
  finishing: { label: 'Finishing',  dot: 'bg-blue-400' },
  completed: { label: 'Completed',  dot: 'bg-slate-400' },
  faulted:   { label: 'Faulted',    dot: 'bg-[hsl(var(--destructive))]' },
}

const ACTIVE_STATUSES: SessionStatus[] = ['preparing', 'charging', 'paused', 'finishing']

function fmt(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function fmtKwh(wh: number): string {
  return `${(wh / 1000).toFixed(2)} kWh`
}

function fmtDuration(minutes: number | null): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

/* ── Session row ─────────────────────────────────────────── */

function SessionRow({ session }: { session: HostSession }) {
  const cfg = STATUS_CONFIG[session.status]
  const isActive = ACTIVE_STATUSES.includes(session.status)

  return (
    <Link
      href={`/host/sessions/${session.id}`}
      className={cn(
        'grid grid-cols-[1fr_auto] items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-[hsl(var(--muted)_/_50%)]',
        isActive
          ? 'border-[hsl(var(--primary)_/_30%)] bg-[hsl(var(--primary)_/_5%)]'
          : 'border-[hsl(var(--border))]',
      )}
      aria-label={`Session at ${session.listingTitle ?? 'unknown listing'}`}
    >
      <div className="min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <span
            className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', cfg.dot)}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold">
            {session.listingTitle ?? session.chargePointId}
          </span>
          {session.listingCity && (
            <span className="hidden truncate text-xs text-[hsl(var(--muted-foreground))] sm:block">
              · {session.listingCity}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-4 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="flex items-center gap-1">
            <BatteryCharging className="h-3 w-3" aria-hidden="true" />
            {fmtKwh(session.energyConsumedWh)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {fmtDuration(session.durationMinutes)}
          </span>
          <span className="flex items-center gap-1">
            <PoundSterling className="h-3 w-3" aria-hidden="true" />
            {fmt(session.totalCostPence)}
          </span>
          {session.driverName && (
            <span className="truncate">Driver: {session.driverName}</span>
          )}
        </div>

        <p className="mt-1.5 pl-4 text-xs text-[hsl(var(--muted-foreground))]">
          {isActive ? 'Started' : session.endedAt ? 'Ended' : 'Started'}{' '}
          {fmtDate(session.endedAt ?? session.startedAt)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            isActive
              ? 'bg-[hsl(var(--primary)_/_15%)] text-[hsl(var(--primary))]'
              : session.status === 'faulted'
                ? 'bg-[hsl(var(--destructive)_/_10%)] text-[hsl(var(--destructive))]'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
          )}
        >
          {cfg.label}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      </div>
    </Link>
  )
}

/* ── Page ────────────────────────────────────────────────── */

type StatusFilter = 'all' | 'active' | 'completed' | 'faulted'

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'faulted',   label: 'Faulted' },
]

export default function HostSessionsPage() {
  const [sessions, setSessions]   = useState<HostSession[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<StatusFilter>('all')
  const [error, setError]         = useState<string | null>(null)

  const PAGE_SIZE = 20

  const fetchSessions = useCallback(async (p: number, statusFilter: StatusFilter) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (statusFilter !== 'all') {
        // Map UI filter → comma-separated status values for the API
        const STATUS_MAP: Record<Exclude<StatusFilter, 'all'>, string> = {
          active: 'charging,preparing,paused,finishing',
          completed: 'completed',
          faulted: 'faulted',
        }
        params.set('status', STATUS_MAP[statusFilter])
      }
      const res = await fetch(`/api/v1/sessions?role=host&${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = (await res.json()) as { data: SessionsResponse }
      setSessions(p === 1 ? data.data.sessions : (prev) => [...prev, ...data.data.sessions])
      setTotal(data.data.total)
      setPage(p)
    } catch {
      setError('Failed to load sessions. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSessions(1, filter)
  }, [fetchSessions, filter])

  const activeSessions = sessions.filter((s) => ACTIVE_STATUSES.includes(s.status))
  const hasMore = sessions.length < total

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            {total} total · {activeSessions.length} active now
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Filter</span>
        </div>
      </div>

      {/* Active sessions banner */}
      {activeSessions.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[hsl(var(--primary)_/_30%)] bg-[hsl(var(--primary)_/_8%)] px-4 py-3">
          <Zap className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
          <p className="text-sm font-medium text-[hsl(var(--primary))]">
            {activeSessions.length} session{activeSessions.length !== 1 ? 's' : ''} currently in progress
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Filter sessions"
        className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-[hsl(var(--muted))] p-1"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => { setFilter(tab.key); setSessions([]) }}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filter === tab.key
                ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Session list */}
      {loading && sessions.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" aria-label="Loading sessions" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[hsl(var(--border))] py-16 text-center">
          <BatteryCharging className="mx-auto h-10 w-10 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No sessions yet</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Sessions will appear here once drivers start charging at your listings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}

          {hasMore && (
            <button
              onClick={() => { void fetchSessions(page + 1, filter) }}
              disabled={loading}
              className="mt-3 w-full rounded-lg border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              {loading ? 'Loading…' : `Load more (${total - sessions.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
