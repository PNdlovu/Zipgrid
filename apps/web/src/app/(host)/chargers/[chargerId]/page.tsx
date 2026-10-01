/**
 * @file page.tsx
 * @description /host/chargers/[chargerId] — OCPP device health dashboard.
 * Shows: online/offline status, last heartbeat, firmware version, fault history,
 * maintenance log, and quick action buttons (pause/restart/diagnose).
 *
 * @module apps/web/app/(host)/chargers/[chargerId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2,
  Zap, Clock, Wrench, Brain, ArrowLeft, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ChargerHealth = {
  chargerId: string
  chargePointId: string
  brand: string
  model: string
  connected: boolean
  status: string
  firmwareVersion: string | null
  lastHeartbeat: string | null
  lastSeen: string | null
  healthScore: number
  faults: Array<{ errorCode: string; timestamp: string; resolved: boolean }>
  activeSessions: number
}

type MaintenanceEntry = {
  id: string
  note: string
  createdAt: string
  type: 'inspection' | 'repair' | 'firmware' | 'other'
}

/** Status badge */
function StatusBadge({ connected, status }: { connected: boolean; status: string }) {
  if (!connected) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.08)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--destructive))]">
        <WifiOff className="h-3 w-3" aria-hidden="true" /> Offline
      </span>
    )
  }
  if (status === 'Faulted') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/08 px-2.5 py-1 text-xs font-medium text-orange-600">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Faulted
      </span>
    )
  }
  if (status === 'Charging') {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--primary))]">
        <Zap className="h-3 w-3" aria-hidden="true" /> Charging
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--foreground))]">
      <Wifi className="h-3 w-3" aria-hidden="true" /> {status}
    </span>
  )
}

/** Health score ring */
function HealthScore({ score }: { score: number }) {
  const color = score >= 80 ? 'text-[hsl(var(--primary))]' : score >= 50 ? 'text-yellow-500' : 'text-[hsl(var(--destructive))]'
  const label = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs attention'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('font-mono text-4xl font-bold', color)}>{score}</span>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
    </div>
  )
}

/**
 * Charger device health dashboard.
 */
export default function ChargerDetailPage({ params }: { params: Promise<{ chargerId: string }> }) {
  const { chargerId } = use(params)
  const [health, setHealth] = useState<ChargerHealth | null>(null)
  const [maintenance, setMaintenance] = useState<MaintenanceEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/chargers/${encodeURIComponent(chargerId)}/health`)
      if (res.ok) {
        const data = await res.json() as { success: boolean; data: ChargerHealth }
        if (data.success) setHealth(data.data)
      }
    } finally {
      setLoading(false)
    }
  }, [chargerId])

  useEffect(() => {
    void fetchHealth()
    const interval = setInterval(fetchHealth, 30_000) // refresh every 30s
    return () => clearInterval(interval)
  }, [fetchHealth])

  const handleAction = async (action: string) => {
    setActionLoading(action)
    try {
      await fetch(`/api/v1/chargers/${encodeURIComponent(chargerId)}/${action}`, { method: 'POST' })
      await fetchHealth()
    } finally {
      setActionLoading(null)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const res = await fetch(`/api/v1/chargers/${encodeURIComponent(chargerId)}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim(), type: 'other' }),
      })
      if (res.ok) {
        setMaintenance((prev) => [
          { id: Date.now().toString(), note: newNote.trim(), createdAt: new Date().toISOString(), type: 'other' },
          ...prev,
        ])
        setNewNote('')
      }
    } finally {
      setAddingNote(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
      </div>
    )
  }

  if (!health) {
    return (
      <div className="flex flex-col items-center gap-4 p-16 text-center">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Charger not found or you don&apos;t have access.</p>
        <Link href="/chargers" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
          ← Back to chargers
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/chargers" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]" aria-label="Back to chargers">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">
              {health.brand} {health.model}
            </h1>
            <StatusBadge connected={health.connected} status={health.status} />
          </div>
          <p className="mt-0.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">
            {health.chargePointId}
          </p>
        </div>
        {/* Quick actions */}
        <div className="flex gap-2">
          {['pause', 'restart', 'diagnose'].map((action) => {
            const Icon = action === 'pause' ? AlertTriangle : action === 'restart' ? RefreshCw : Brain
            return (
              <button
                key={action}
                type="button"
                onClick={() => handleAction(action)}
                disabled={actionLoading === action}
                aria-label={action.charAt(0).toUpperCase() + action.slice(1)}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-3',
                  'text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors',
                  'hover:border-[hsl(var(--primary)/0.4)] hover:text-[hsl(var(--foreground))]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {actionLoading === action
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {action.charAt(0).toUpperCase() + action.slice(1)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Status', value: health.connected ? health.status : 'Offline', icon: Activity },
          { label: 'Last heartbeat', value: health.lastHeartbeat ? new Date(health.lastHeartbeat).toLocaleTimeString('en-GB') : 'Never', icon: Clock },
          { label: 'Firmware', value: health.firmwareVersion ?? 'Unknown', icon: Zap },
          { label: 'Active sessions', value: String(health.activeSessions), icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <Icon className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
              <p className="font-mono text-sm font-semibold text-[hsl(var(--foreground))]">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Health score + fault log */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Health score */}
        <div className="flex flex-col items-center justify-center gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Safety score</p>
          <HealthScore score={health.healthScore} />
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
            Calculated nightly from session history, fault rate, and uptime.
          </p>
        </div>

        {/* Fault log */}
        <div className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Fault history</h2>
          {health.faults.length === 0 ? (
            <div className="flex items-center gap-3 rounded-[6px] bg-[hsl(var(--secondary))] px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No faults recorded</p>
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-2">
              {health.faults.slice(0, 5).map((fault, i) => (
                <li key={i} className={cn(
                  'flex items-center gap-3 rounded-[6px] px-4 py-3 text-sm',
                  fault.resolved
                    ? 'bg-[hsl(var(--secondary))]'
                    : 'border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.05)]',
                )}>
                  {fault.resolved
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                    : <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />}
                  <span className="font-mono text-xs font-medium">{fault.errorCode}</span>
                  <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
                    {new Date(fault.timestamp).toLocaleDateString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Maintenance log */}
      <div className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Maintenance log</h2>
        </div>

        {/* Add note */}
        <div className="flex gap-2">
          <label htmlFor="maintenance-note" className="sr-only">Add maintenance note</label>
          <input
            id="maintenance-note"
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddNote() }}
            placeholder="Add a maintenance note (e.g. 'Checked RCD — all clear')"
            className={cn(
              'h-10 flex-1 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
              'px-3.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]',
              'focus:border-[hsl(var(--primary))] focus:outline-none',
            )}
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={addingNote || !newNote.trim()}
            className={cn(
              'flex h-10 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4',
              'text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            Add
          </button>
        </div>

        {maintenance.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No maintenance notes yet.</p>
        ) : (
          <ul role="list" className="flex flex-col gap-2">
            {maintenance.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 rounded-[6px] bg-[hsl(var(--secondary))] px-4 py-3">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm text-[hsl(var(--foreground))]">{entry.note}</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {new Date(entry.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
