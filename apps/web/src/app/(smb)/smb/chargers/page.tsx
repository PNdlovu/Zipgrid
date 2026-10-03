/**
 * @file page.tsx
 * @description /smb/chargers — Multi-charger management for SMB hosts.
 * Lists all charger listings, their real-time OCPP status, utilisation,
 * and provides quick actions: pause, activate, pair new charger.
 *
 * @module apps/web/app/(smb)/smb/chargers
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  PlugZap, Plus, RefreshCw, AlertTriangle, CheckCircle2, PauseCircle, WifiOff, Zap, Settings, Loader2, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ChargerStatus = 'available' | 'charging' | 'faulted' | 'offline' | 'paused'

type Charger = {
  listingId: string
  title: string
  city: string
  address: string
  chargerLevel: string
  maxPowerKw: number
  plugTypes: string[]
  status: 'active' | 'paused' | 'draft' | 'under_review' | 'deactivated'
  ocppStatus: ChargerStatus | null
  isSmartCharger: boolean
  isNetworked: boolean
  safetyScore: number | null
  totalSessions: number
  totalKwhDelivered: number
  totalRevenuePence: number
  averageRating: number | null
  reviewCount: number
  activeSessions: number
}

type Summary = {
  totalChargers: number
  activeChargers: number
  chargingNow: number
  faultedCount: number
  totalRevenuePence: number
  utilisationPct: number
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchChargers(): Promise<{ chargers: Charger[]; summary: Summary }> {
  const res = await fetch('/api/v1/host/listings?format=charger_management', {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  const json = await res.json() as {
    success: boolean
    data?: { listings: Charger[]; summary: Summary }
  }
  return {
    chargers: json.data?.listings ?? [],
    summary: json.data?.summary ?? {
      totalChargers: 0, activeChargers: 0, chargingNow: 0,
      faultedCount: 0, totalRevenuePence: 0, utilisationPct: 0,
    },
  }
}

async function updateListingStatus(listingId: string, status: 'active' | 'paused') {
  await fetch(`/api/v1/listings/${listingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  })
}

/* ── Helpers ────────────────────────────────────────────────── */

function fmt(pence: number) {
  return `£${(pence / 100).toFixed(2)}`
}

const STATUS_META: Record<ChargerStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  available: { label: 'Available',  color: 'text-green-600',  bg: 'bg-green-50',  icon: <CheckCircle2 className="h-4 w-4" /> },
  charging:  { label: 'Charging',   color: 'text-blue-600',   bg: 'bg-blue-50',   icon: <Zap className="h-4 w-4" /> },
  faulted:   { label: 'Faulted',    color: 'text-red-600',    bg: 'bg-red-50',    icon: <AlertTriangle className="h-4 w-4" /> },
  offline:   { label: 'Offline',    color: 'text-gray-500',   bg: 'bg-gray-100',  icon: <WifiOff className="h-4 w-4" /> },
  paused:    { label: 'Paused',     color: 'text-amber-600',  bg: 'bg-amber-50',  icon: <PauseCircle className="h-4 w-4" /> },
}

const LISTING_STATUS_STYLES: Record<string, string> = {
  active:       'bg-green-100 text-green-700',
  paused:       'bg-amber-100 text-amber-700',
  draft:        'bg-gray-100 text-gray-600',
  under_review: 'bg-red-100 text-red-700',
  deactivated:  'bg-gray-200 text-gray-500',
}

/* ── Safety Score badge ─────────────────────────────────────── */

function SafetyBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-400">No score</span>
  const color = score >= 70 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600'
  return (
    <span className={cn('text-sm font-bold', color)}>🛡 {score}/100</span>
  )
}

/* ── Charger card ───────────────────────────────────────────── */

function ChargerCard({
  charger,
  onToggle,
}: {
  charger: Charger
  onToggle: (id: string, newStatus: 'active' | 'paused') => Promise<void>
}) {
  const [toggling, setToggling] = useState(false)
  const ocpp = charger.ocppStatus ? STATUS_META[charger.ocppStatus] : null

  const handleToggle = async () => {
    setToggling(true)
    const next = charger.status === 'active' ? 'paused' : 'active'
    await onToggle(charger.listingId, next)
    setToggling(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 flex-shrink-0 text-green-600" />
            <h3 className="truncate text-base font-bold text-gray-900">{charger.title}</h3>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">{charger.city} · {charger.address}</p>
        </div>
        <span className={cn('flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', LISTING_STATUS_STYLES[charger.status] ?? 'bg-gray-100 text-gray-600')}>
          {charger.status.replace('_', ' ')}
        </span>
      </div>

      {/* OCPP + specs row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ocpp && (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', ocpp.bg, ocpp.color)}>
            {ocpp.icon}
            {ocpp.label}
          </span>
        )}
        {!charger.isNetworked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
            <WifiOff className="h-3 w-3" /> Non-networked
          </span>
        )}
        <span className="text-xs text-gray-500">{charger.chargerLevel.replace('_', ' ')} · {charger.maxPowerKw} kW</span>
        <span className="text-xs text-gray-500">{charger.plugTypes.join(', ')}</span>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatMini label="Sessions" value={charger.totalSessions.toLocaleString()} />
        <StatMini label="kWh delivered" value={charger.totalKwhDelivered.toFixed(1)} />
        <StatMini label="Revenue" value={fmt(charger.totalRevenuePence)} />
      </div>

      {/* Safety + rating row */}
      <div className="mb-4 flex items-center justify-between">
        <SafetyBadge score={charger.safetyScore} />
        {charger.averageRating != null && (
          <span className="text-sm text-gray-600">
            ★ {charger.averageRating.toFixed(1)} <span className="text-gray-400">({charger.reviewCount})</span>
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={toggling || ['deactivated', 'under_review'].includes(charger.status)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
            charger.status === 'active'
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200',
            (toggling || ['deactivated', 'under_review'].includes(charger.status)) && 'cursor-not-allowed opacity-50',
          )}
        >
          {toggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : charger.status === 'active' ? (
            <><PauseCircle className="h-3.5 w-3.5" /> Pause</>
          ) : (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Activate</>
          )}
        </button>
        <Link
          href={`/host/listings/${charger.listingId}`}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <Settings className="h-3.5 w-3.5" /> Edit
        </Link>
        <Link
          href={`/host/chargers/${charger.listingId}`}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <BarChart3 className="h-3.5 w-3.5" /> Stats
        </Link>
      </div>
    </div>
  )
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900">{value}</p>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /smb/chargers — Multi-charger management for SMB hosts. */
export default function SmBChargersPage() {
  const [chargers, setChargers]       = useState<Charger[]>([])
  const [summary, setSummary]         = useState<Summary | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [filter, setFilter]           = useState<'all' | 'active' | 'faulted' | 'paused'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { chargers: cs, summary: sm } = await fetchChargers()
      setChargers(cs)
      setSummary(sm)
    } catch {
      setError('Could not load chargers. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleToggle = async (id: string, status: 'active' | 'paused') => {
    await updateListingStatus(id, status)
    void load()
  }

  const filtered = chargers.filter((c) => {
    if (filter === 'all')     return true
    if (filter === 'active')  return c.status === 'active'
    if (filter === 'faulted') return c.ocppStatus === 'faulted'
    if (filter === 'paused')  return c.status === 'paused'
    return true
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Charger Management</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor, pause, and manage all your EV chargers in one place.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <Link
            href="/chargers/pair"
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" /> Add charger
          </Link>
        </div>
      </div>

      {/* KPI summary */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total chargers',     value: summary.totalChargers },
            { label: 'Active',             value: summary.activeChargers },
            { label: 'Charging now',       value: summary.chargingNow },
            { label: 'Faulted',            value: summary.faultedCount,          alert: summary.faultedCount > 0 },
            { label: 'Utilisation',        value: `${summary.utilisationPct.toFixed(0)}%` },
            { label: 'Total revenue',      value: fmt(summary.totalRevenuePence), highlight: true },
          ].map(({ label, value, alert, highlight }) => (
            <div
              key={label}
              className={cn(
                'rounded-xl border p-4 text-center shadow-sm',
                alert     ? 'border-red-200 bg-red-50'    : '',
                highlight ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white',
              )}
            >
              <p className={cn('text-xs font-medium', alert ? 'text-red-500' : 'text-gray-500')}>{label}</p>
              <p className={cn('mt-1 text-xl font-extrabold', alert ? 'text-red-700' : highlight ? 'text-green-700' : 'text-gray-900')}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {(['all', 'active', 'faulted', 'paused'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-colors',
              filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {f}
            {f === 'faulted' && summary && summary.faultedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                {summary.faultedCount}
              </span>
            )}
          </button>
        ))}
      </div>

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
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <PlugZap className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <h3 className="text-base font-semibold text-gray-700">No chargers found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter !== 'all' ? 'No chargers match this filter.' : 'Add your first charger to get started.'}
          </p>
          {filter === 'all' && (
            <Link href="/chargers/pair" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              <Plus className="h-4 w-4" /> Pair a charger
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ChargerCard key={c.listingId} charger={c} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  )
}
