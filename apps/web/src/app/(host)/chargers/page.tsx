/**
 * @file page.tsx
 * @description /host/chargers — list of all paired chargers with live status.
 * Links to individual charger health dashboards.
 * Shows OCPP connection status, last heartbeat, and active sessions.
 *
 * @module apps/web/app/(host)/chargers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  PlugZap, Plus, ChevronRight, Wifi, WifiOff,
  AlertTriangle, Zap, Clock, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────── */

type ChargerStatus = 'available' | 'charging' | 'faulted' | 'offline' | 'pending'

type Charger = {
  id: string
  chargePointId: string
  brand: string | null
  model: string | null
  status: ChargerStatus
  isConnected: boolean
  lastHeartbeat: string | null
  firmwareVersion: string | null
  activeSessionCount: number
  safetyScore: number | null
  ocppUrl: string
  createdAt: string
}

/* ── Status config ───────────────────────────────────────── */

const STATUS_CONFIG: Record<ChargerStatus, {
  label: string
  dot: string
  badge: string
}> = {
  available: {
    label: 'Available',
    dot: 'bg-[hsl(var(--primary))]',
    badge: 'bg-[hsl(var(--primary)_/_10%)] text-[hsl(var(--primary))]',
  },
  charging: {
    label: 'Charging',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  faulted: {
    label: 'Faulted',
    dot: 'bg-[hsl(var(--destructive))]',
    badge: 'bg-[hsl(var(--destructive)_/_10%)] text-[hsl(var(--destructive))]',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-[hsl(var(--muted-foreground))]',
    badge: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  },
  pending: {
    label: 'Pending',
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
}

/* ── Helpers ─────────────────────────────────────────────── */

function fmtHeartbeat(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/* ── Charger card ─────────────────────────────────────────── */

function ChargerCard({ charger }: { charger: Charger }) {
  const cfg = STATUS_CONFIG[charger.status] ?? STATUS_CONFIG['offline']

  return (
    <Link
      href={`/host/chargers/${charger.id}`}
      className="group flex items-start justify-between gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-colors hover:border-[hsl(var(--primary)_/_40%)] hover:bg-[hsl(var(--muted)_/_50%)]"
      aria-label={`${charger.brand ?? ''} ${charger.model ?? charger.chargePointId} — ${cfg.label}`}
    >
      <div className="flex items-start gap-4 min-w-0">
        {/* Icon */}
        <div className="relative mt-0.5 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--muted))]">
            <PlugZap className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" strokeWidth={1.5} />
          </div>
          {/* Connection dot */}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[hsl(var(--card))]',
              charger.isConnected ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground))]',
            )}
            aria-hidden="true"
          />
        </div>

        {/* Info */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-sm">
              {charger.brand && charger.model
                ? `${charger.brand} ${charger.model}`
                : charger.chargePointId}
            </p>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.badge)}>
              {cfg.label}
            </span>
            {charger.activeSessionCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                {charger.activeSessionCount} active
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">
            {charger.chargePointId}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
            {charger.isConnected ? (
              <span className="flex items-center gap-1 text-[hsl(var(--primary))]">
                <Wifi className="h-3 w-3" aria-hidden="true" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                Disconnected
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {fmtHeartbeat(charger.lastHeartbeat)}
            </span>
            {charger.firmwareVersion && (
              <span>FW {charger.firmwareVersion}</span>
            )}
            {charger.safetyScore != null && (
              <span className={cn(
                'font-medium',
                charger.safetyScore >= 80 ? 'text-[hsl(var(--primary))]'
                  : charger.safetyScore >= 50 ? 'text-amber-600'
                  : 'text-[hsl(var(--destructive))]',
              )}>
                Safety {charger.safetyScore}/100
              </span>
            )}
          </div>
        </div>
      </div>

      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}

/* ── Page ────────────────────────────────────────────────── */

/** Page at /chargers — list of all paired chargers with live status. */
export default function HostChargersPage() {
  const [chargers, setChargers] = useState<Charger[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const fetchChargers = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/v1/chargers')
      if (!res.ok) throw new Error('Failed to load chargers')
      const data = (await res.json()) as { data: Charger[] }
      setChargers(data.data)
    } catch {
      setError('Could not load your chargers. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchChargers()
    // Poll every 30 seconds for live status updates
    const interval = setInterval(() => { void fetchChargers() }, 30_000)
    return () => clearInterval(interval)
  }, [fetchChargers])

  const connectedCount = chargers.filter((c) => c.isConnected).length
  const activeCount    = chargers.filter((c) => c.activeSessionCount > 0).length
  const faultedCount   = chargers.filter((c) => c.status === 'faulted').length

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Chargers</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            {chargers.length} paired
            {connectedCount > 0 && ` · ${connectedCount} online`}
            {activeCount > 0 && ` · ${activeCount} charging`}
            {faultedCount > 0 && ` · ${faultedCount} faulted`}
          </p>
        </div>
        <Link
          href="/chargers/pair"
          className="mt-3 flex w-fit items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white sm:mt-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Pair a charger
        </Link>
      </div>

      {/* Faulted banner */}
      {faultedCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
          <p className="text-sm font-medium text-[hsl(var(--destructive))]">
            {faultedCount} charger{faultedCount !== 1 ? 's' : ''} reporting a fault — check health details.
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading chargers" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-[hsl(var(--destructive)_/_30%)] bg-[hsl(var(--destructive)_/_8%)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      ) : chargers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[hsl(var(--border))] py-16 text-center">
          <PlugZap className="mx-auto h-10 w-10 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No chargers paired yet</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Pair your smart charger to enable remote start/stop and live monitoring.
          </p>
          <Link
            href="/chargers/pair"
            className="mt-5 inline-flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Pair your first charger
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {chargers.map((charger) => (
            <ChargerCard key={charger.id} charger={charger} />
          ))}
        </div>
      )}
    </div>
  )
}
