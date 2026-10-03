/**
 * @file page.tsx
 * @description /host/chargers/health — Charger health dashboard.
 * Shows OCPP connectivity, fault history, safety scores, last heartbeat,
 * and predictive maintenance warnings for all host chargers.
 *
 * @module apps/web/app/(host)/chargers/health
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Activity, AlertTriangle, CheckCircle2, WifiOff, Clock, RefreshCw, Loader2, Shield, TrendingDown, Info, ChevronRight, PlugZap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ConnectorStatus = 'Available' | 'Preparing' | 'Charging' | 'SuspendedEVSE' | 'SuspendedEV' | 'Finishing' | 'Reserved' | 'Unavailable' | 'Faulted'

type ChargerHealth = {
  listingId: string
  ocppChargePointId: string | null
  title: string
  isSmartCharger: boolean
  isNetworked: boolean
  // Live OCPP state
  connected: boolean
  lastHeartbeatAt: string | null
  lastHeartbeatAgoSeconds: number | null
  connectorStatus: ConnectorStatus | null
  // Fault history (last 30 days)
  faultCount30d: number
  lastFaultAt: string | null
  lastFaultCode: string | null
  // Safety score
  safetyScore: number | null
  safetyBand: 'excellent' | 'good' | 'fair' | 'needs_attention' | null
  autoPaused: boolean
  // Predictive maintenance
  chargerAgeYears: number | null
  maintenanceWarnings: string[]
  // Uptime
  uptimePct30d: number | null
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchChargerHealth(): Promise<ChargerHealth[]> {
  const res = await fetch('/api/v1/host/chargers/health', { credentials: 'include' })
  const json = await res.json() as { data?: { chargers: ChargerHealth[] } }
  return json.data?.chargers ?? []
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtAgo(seconds: number | null): string {
  if (seconds == null) return 'Never'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const CONNECTOR_META: Record<ConnectorStatus, { color: string; bg: string; label: string }> = {
  Available:     { color: 'text-green-700',  bg: 'bg-green-50',  label: 'Available' },
  Preparing:     { color: 'text-blue-700',   bg: 'bg-blue-50',   label: 'Preparing' },
  Charging:      { color: 'text-blue-700',   bg: 'bg-blue-100',  label: 'Charging' },
  SuspendedEVSE: { color: 'text-amber-700',  bg: 'bg-amber-50',  label: 'Suspended (EVSE)' },
  SuspendedEV:   { color: 'text-amber-700',  bg: 'bg-amber-50',  label: 'Suspended (EV)' },
  Finishing:     { color: 'text-purple-700', bg: 'bg-purple-50', label: 'Finishing' },
  Reserved:      { color: 'text-indigo-700', bg: 'bg-indigo-50', label: 'Reserved' },
  Unavailable:   { color: 'text-gray-600',   bg: 'bg-gray-100',  label: 'Unavailable' },
  Faulted:       { color: 'text-red-700',    bg: 'bg-red-100',   label: 'Faulted' },
}

const SAFETY_BAND_COLORS: Record<string, string> = {
  excellent:       'text-green-700',
  good:            'text-emerald-600',
  fair:            'text-amber-600',
  needs_attention: 'text-red-600',
}

/* ── Heartbeat freshness indicator ──────────────────────────── */

function HeartbeatDot({ seconds }: { seconds: number | null }) {
  // Green < 120s, amber < 600s, red >= 600s or null
  const color = seconds == null ? 'bg-gray-300'
    : seconds < 120  ? 'bg-green-500'
    : seconds < 600  ? 'bg-amber-500'
    : 'bg-red-500'
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color)} aria-hidden="true" />
}

/* ── Individual charger card ────────────────────────────────── */

function HealthCard({ c }: { c: ChargerHealth }) {
  const connMeta = c.connectorStatus ? CONNECTOR_META[c.connectorStatus] : null

  return (
    <div className={cn(
      'rounded-xl border bg-white p-5 shadow-sm',
      c.autoPaused ? 'border-red-200' : c.faultCount30d > 0 ? 'border-amber-200' : 'border-gray-200',
    )}>
      {/* Title row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <h3 className="truncate text-sm font-bold text-gray-900">{c.title}</h3>
          </div>
          {c.ocppChargePointId && (
            <p className="mt-0.5 font-mono text-xs text-gray-400">{c.ocppChargePointId}</p>
          )}
        </div>
        {c.autoPaused && (
          <span className="flex-shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            Auto-paused
          </span>
        )}
      </div>

      {/* Connectivity */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {c.isNetworked ? (
          <div className="flex items-center gap-1.5">
            <HeartbeatDot seconds={c.lastHeartbeatAgoSeconds} />
            <span className="text-xs text-gray-600">
              {c.connected ? 'Online' : 'Disconnected'} · {fmtAgo(c.lastHeartbeatAgoSeconds)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-gray-400">
            <WifiOff className="h-3.5 w-3.5" />
            <span className="text-xs">Non-networked</span>
          </div>
        )}

        {connMeta && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', connMeta.bg, connMeta.color)}>
            {connMeta.label}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {/* Safety score */}
        <div className="rounded-lg bg-gray-50 p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Shield className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">Safety</span>
          </div>
          <p className={cn('mt-0.5 text-base font-bold', c.safetyBand ? SAFETY_BAND_COLORS[c.safetyBand] : 'text-gray-400')}>
            {c.safetyScore != null ? `${c.safetyScore}` : '—'}
          </p>
        </div>

        {/* Faults 30d */}
        <div className={cn('rounded-lg p-3 text-center', c.faultCount30d > 0 ? 'bg-red-50' : 'bg-gray-50')}>
          <div className="flex items-center justify-center gap-1">
            <AlertTriangle className={cn('h-3.5 w-3.5', c.faultCount30d > 0 ? 'text-red-400' : 'text-gray-400')} />
            <span className="text-xs text-gray-500">Faults (30d)</span>
          </div>
          <p className={cn('mt-0.5 text-base font-bold', c.faultCount30d > 0 ? 'text-red-600' : 'text-gray-700')}>
            {c.faultCount30d}
          </p>
        </div>

        {/* Uptime */}
        <div className="rounded-lg bg-gray-50 p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Activity className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">Uptime</span>
          </div>
          <p className="mt-0.5 text-base font-bold text-gray-700">
            {c.uptimePct30d != null ? `${c.uptimePct30d.toFixed(0)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Last fault */}
      {c.lastFaultAt && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-xs font-semibold text-red-700">Last fault: {c.lastFaultCode ?? 'Unknown'}</p>
              <p className="text-xs text-red-500">{fmtDate(c.lastFaultAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance warnings */}
      {c.maintenanceWarnings.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {c.maintenanceWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <TrendingDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charger age */}
      {c.chargerAgeYears != null && (
        <p className="mb-3 text-xs text-gray-400">
          <Clock className="mb-0.5 mr-1 inline h-3 w-3" />
          Charger age: {c.chargerAgeYears} year{c.chargerAgeYears !== 1 ? 's' : ''}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={`/host/chargers/${c.listingId}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          View details <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/host/listings/${c.listingId}#safety`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Shield className="h-3.5 w-3.5" /> Safety
        </Link>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /chargers/health — Charger health dashboard. */
export default function ChargerHealthPage() {
  const [chargers, setChargers]   = useState<ChargerHealth[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setChargers(await fetchChargerHealth())
      setLastRefresh(new Date())
    } catch {
      setError('Could not load charger health data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // Auto-refresh every 60 seconds
    const id = setInterval(() => void load(), 60_000)
    return () => clearInterval(id)
  }, [load])

  // Summary counts
  const faulted  = chargers.filter((c) => c.connectorStatus === 'Faulted' || c.autoPaused).length
  const offline  = chargers.filter((c) => c.isNetworked && !c.connected).length
  const warnings = chargers.filter((c) => c.maintenanceWarnings.length > 0).length
  const healthy  = chargers.length - faulted - offline

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Charger Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Live OCPP connectivity, fault history, and maintenance alerts.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Summary banner */}
      {!loading && chargers.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} label="Healthy" value={healthy} color="text-green-700" />
          <SummaryCard icon={<AlertTriangle className="h-5 w-5 text-red-500" />} label="Faulted / Paused" value={faulted} color={faulted > 0 ? 'text-red-700' : 'text-gray-600'} alert={faulted > 0} />
          <SummaryCard icon={<WifiOff className="h-5 w-5 text-amber-500" />} label="Offline" value={offline} color={offline > 0 ? 'text-amber-700' : 'text-gray-600'} />
          <SummaryCard icon={<TrendingDown className="h-5 w-5 text-amber-500" />} label="Warnings" value={warnings} color={warnings > 0 ? 'text-amber-700' : 'text-gray-600'} />
        </div>
      )}

      {/* Last refresh */}
      {!loading && (
        <p className="mb-4 text-xs text-gray-400">
          <Clock className="mb-0.5 mr-1 inline h-3 w-3" />
          Last refreshed {lastRefresh.toLocaleTimeString('en-GB')} · Auto-refreshes every 60s
        </p>
      )}

      {/* Info */}
      {chargers.some((c) => !c.isNetworked) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
          <p className="text-sm text-blue-800">
            Non-networked chargers don&apos;t report live status. Upgrade to a smart charger for real-time monitoring.
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : chargers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <PlugZap className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-700">No chargers yet</h3>
          <p className="mt-1 text-sm text-gray-500">Pair a charger to see its health status here.</p>
          <Link href="/chargers/pair" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            Pair a charger
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chargers.map((c) => (
            <HealthCard key={c.listingId} c={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  icon, label, value, color, alert,
}: { icon: React.ReactNode; label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-sm', alert ? 'border-red-200 bg-red-50' : 'border-gray-200')}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={cn('mt-1 text-2xl font-extrabold', color)}>{value}</p>
    </div>
  )
}
