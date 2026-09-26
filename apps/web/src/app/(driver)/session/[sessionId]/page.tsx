/**
 * @file page.tsx
 * @description /driver/session/[sessionId] — Active charging session screen.
 * Real-time kWh counter, live cost, power graph, Stop button.
 * Updates via Supabase Realtime (< 5s latency from OCPP MeterValues).
 *
 * @module apps/web/app/(driver)/session/[sessionId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Zap, Square, MapPin, Clock, Battery, ArrowLeft,
  AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SessionState = {
  id: string
  status: 'preparing' | 'charging' | 'paused' | 'finishing' | 'completed' | 'faulted'
  energyConsumedWh: number
  totalCostPence: number
  pricePerKwhPence: number
  powerW: number | null
  socPercent: number | null
  startedAt: string
  listingTitle: string
  listingCity: string
  hostName: string
}

const STATUS_CONFIG = {
  preparing: { label: 'Preparing…', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  charging: { label: 'Charging', color: 'text-[hsl(var(--primary))]', bg: 'bg-[hsl(var(--primary)/0.1)]' },
  paused: { label: 'Paused', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  finishing: { label: 'Finishing', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  completed: { label: 'Complete', color: 'text-[hsl(var(--primary))]', bg: 'bg-[hsl(var(--primary)/0.1)]' },
  faulted: { label: 'Fault', color: 'text-[hsl(var(--destructive))]', bg: 'bg-[hsl(var(--destructive)/0.1)]' },
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * Active session screen — real-time charging monitor.
 */
export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState('0s')
  const [pulseKey, setPulseKey] = useState(0)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}`)
      if (res.ok) {
        const data = await res.json() as { success: boolean; data: SessionState }
        if (data.success) {
          setSession(data.data)
          setPulseKey((k) => k + 1) // trigger pulse animation on update
        }
      }
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // Poll for updates every 5 seconds (matches OCPP MeterValues interval)
  useEffect(() => {
    void fetchSession()
    const interval = setInterval(fetchSession, 5000)
    return () => clearInterval(interval)
  }, [fetchSession])

  // Elapsed time counter
  useEffect(() => {
    if (!session?.startedAt || session.status === 'completed') return
    const timer = setInterval(() => {
      setElapsed(formatDuration(session.startedAt))
    }, 1000)
    return () => clearInterval(timer)
  }, [session?.startedAt, session?.status])

  const handleStop = async () => {
    setStopError(null)
    setStopping(true)
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/stop`, { method: 'POST' })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setStopError(json.error?.message ?? 'Stop command failed. Please try again.')
        return
      }
      await fetchSession()
    } finally {
      setStopping(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading session" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center p-8">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Session not found.</p>
        <Link href="/driver/bookings" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
          View my bookings
        </Link>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[session.status]
  const kwhDelivered = session.energyConsumedWh / 1000
  const costPounds = session.totalCostPence / 100
  const powerKw = session.powerW != null ? session.powerW / 1000 : null
  const isActive = ['preparing', 'charging', 'paused', 'finishing'].includes(session.status)
  const isCompleted = session.status === 'completed'
  const isFaulted = session.status === 'faulted'

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-4">
        <Link
          href="/driver/bookings"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
          aria-label="Back to bookings"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{session.listingTitle}</p>
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {session.listingCity}
          </div>
        </div>
        {/* Status pill */}
        <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', statusConfig.bg, statusConfig.color)}>
          {session.status === 'charging' && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary))] opacity-75" aria-hidden="true" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
            </span>
          )}
          {statusConfig.label}
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center gap-8 px-6 py-10" aria-live="polite" aria-atomic="true">

        {/* Primary metric — kWh */}
        <div className="flex flex-col items-center gap-2">
          <Zap className={cn('h-10 w-10', session.status === 'charging' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]')} aria-hidden="true" strokeWidth={1.5} />
          <div className="flex flex-col items-center">
            <span className="font-mono text-6xl font-bold tabular-nums text-[hsl(var(--foreground))]" aria-label={`${kwhDelivered.toFixed(2)} kilowatt-hours delivered`}>
              {kwhDelivered.toFixed(2)}
            </span>
            <span className="text-sm text-[hsl(var(--muted-foreground))]">kWh delivered</span>
          </div>
        </div>

        {/* Secondary metrics */}
        <div className="grid w-full max-w-sm grid-cols-3 gap-4">
          {[
            { label: 'Cost', value: `£${costPounds.toFixed(2)}`, icon: null },
            { label: 'Duration', value: isCompleted ? '—' : elapsed, icon: Clock },
            { label: powerKw != null ? 'Power' : 'Rate', value: powerKw != null ? `${powerKw.toFixed(1)}kW` : `£${(session.pricePerKwhPence / 100).toFixed(2)}/kWh`, icon: Zap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center gap-1 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-4">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
              <span className="font-mono text-lg font-bold text-[hsl(var(--foreground))]">{value}</span>
              {Icon && <Icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />}
            </div>
          ))}
        </div>

        {/* SoC bar */}
        {session.socPercent != null && (
          <div className="w-full max-w-sm">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                <Battery className="h-3.5 w-3.5" aria-hidden="true" /> Battery
              </span>
              <span className="font-mono font-semibold text-[hsl(var(--foreground))]">{session.socPercent}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]" role="progressbar" aria-valuenow={session.socPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Battery state of charge">
              <div
                className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-1000"
                style={{ width: `${session.socPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Stop button */}
        {isActive && (
          <div className="flex w-full max-w-sm flex-col items-center gap-3">
            {stopError && (
              <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{stopError}</p>
            )}
            <button
              type="button"
              onClick={handleStop}
              disabled={stopping}
              aria-busy={stopping}
              className={cn(
                'flex h-14 w-full items-center justify-center gap-3 rounded-[6px]',
                'border-2 border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.06)] text-base font-semibold',
                'text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/0.12)]',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {stopping
                ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Stopping…</>
                : <><Square className="h-5 w-5" aria-hidden="true" strokeWidth={2} /> Stop charging</>}
            </button>
            <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
              Payment captures automatically when your session ends.
            </p>
          </div>
        )}

        {/* Completed state */}
        {isCompleted && (
          <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
            <CheckCircle2 className="h-12 w-12 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            <div>
              <p className="text-lg font-semibold text-[hsl(var(--foreground))]">Session complete</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                You charged {kwhDelivered.toFixed(2)} kWh for £{costPounds.toFixed(2)}.
              </p>
            </div>
            <Link
              href="/driver/bookings"
              className={cn(
                'flex h-11 w-full items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
                'text-sm font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
              )}
            >
              View session receipt
            </Link>
          </div>
        )}

        {/* Faulted state */}
        {isFaulted && (
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-[hsl(var(--destructive))]" aria-hidden="true" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-[hsl(var(--foreground))]">Charger fault detected</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Our team has been notified. Please contact support if you need immediate assistance.
              </p>
            </div>
            <Link href="/help/chat" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
              Contact support →
            </Link>
          </div>
        )}

        {/* Live indicator */}
        {session.status === 'charging' && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]" aria-live="off">
            Updates every 5 seconds from your charger
          </p>
        )}
      </main>
    </div>
  )
}
