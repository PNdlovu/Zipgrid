/**
 * @file page.tsx
 * @description /session — Live charging session monitor.
 *
 * Shows the active or most-recent session for the authenticated driver:
 *   - Live energy (kWh), cost (£), power (kW), SoC (%), duration
 *   - Circular SoC ring with animated fill
 *   - Status banner (preparing / charging / finishing / completed / faulted)
 *   - Stop charging button (with confirmation)
 *   - Meter value sparkline (last 6 readings)
 *   - Session detail: listing title, host, start time, price model
 *
 * Polling: refreshes every 10 seconds while session is active.
 * Redirects to /bookings if no active/recent session found.
 *
 * @module apps/web/app/(driver)/session
 * @version 0.1.0
 * @since 2026-09-30
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Zap, PoundSterling, Clock, Thermometer, Activity,
  MapPin, StopCircle, CheckCircle2, AlertTriangle,
  Loader2, ChevronLeft, Battery,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Suspense } from 'react'

/* ── Types ──────────────────────────────────────────────────── */

type SessionState = {
  id: string
  status: 'preparing' | 'charging' | 'paused' | 'finishing' | 'completed' | 'faulted'
  energyConsumedWh: number
  totalCostPence: number
  pricePerKwhPence: number
  powerW: number | null
  socPercent: number | null
  startedAt: string | null
  endedAt: string | null
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
  chargePointId: string | null
}

/* ── Status config ──────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, {
  label: string
  colour: string
  bgColour: string
  pulse: boolean
  icon: React.ElementType
}> = {
  preparing: {
    label: 'Preparing to charge…',
    colour: 'text-amber-500',
    bgColour: 'bg-amber-50 dark:bg-amber-950/30',
    pulse: true,
    icon: Loader2,
  },
  charging: {
    label: 'Charging',
    colour: 'text-[hsl(var(--primary))]',
    bgColour: 'bg-[hsl(var(--primary)/0.06)]',
    pulse: true,
    icon: Zap,
  },
  paused: {
    label: 'Charging paused',
    colour: 'text-amber-500',
    bgColour: 'bg-amber-50 dark:bg-amber-950/30',
    pulse: false,
    icon: Clock,
  },
  finishing: {
    label: 'Finishing…',
    colour: 'text-[hsl(var(--primary))]',
    bgColour: 'bg-[hsl(var(--primary)/0.06)]',
    pulse: true,
    icon: Loader2,
  },
  completed: {
    label: 'Charging complete',
    colour: 'text-[hsl(var(--primary))]',
    bgColour: 'bg-[hsl(var(--primary)/0.06)]',
    pulse: false,
    icon: CheckCircle2,
  },
  faulted: {
    label: 'Charger fault detected',
    colour: 'text-[hsl(var(--destructive))]',
    bgColour: 'bg-[hsl(var(--destructive)/0.06)]',
    pulse: false,
    icon: AlertTriangle,
  },
}

/* ── Helpers ────────────────────────────────────────────────── */

function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }
function fmtKwh(wh: number)  { return `${(wh / 1000).toFixed(2)} kWh` }
function fmtKw(w: number)    { return `${(w / 1000).toFixed(1)} kW` }
function fmtDuration(startedAt: string | null): string {
  if (!startedAt) return '0:00'
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/* ── SoC ring ───────────────────────────────────────────────── */

function SocRing({ soc, status }: { soc: number | null; status: string }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const pct = soc ?? 0
  const strokeDash = (pct / 100) * circumference

  const ringColour =
    status === 'faulted' ? '#ef4444'
    : pct >= 80 ? '#00C853'
    : pct >= 40 ? '#f59e0b'
    : '#ef4444'

  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
        {/* Track */}
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          strokeWidth="10"
          stroke="hsl(var(--muted))"
          strokeOpacity="0.3"
        />
        {/* Progress */}
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          strokeWidth="10"
          stroke={ringColour}
          strokeLinecap="round"
          strokeDasharray={`${strokeDash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <Battery className="mb-1 h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        {soc !== null ? (
          <>
            <span className="text-3xl font-bold tabular-nums text-[hsl(var(--foreground))]">
              {soc}
            </span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">%</span>
          </>
        ) : (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">—</span>
        )}
      </div>
    </div>
  )
}

/* ── Metric card ────────────────────────────────────────────── */

function MetricCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">
        <Icon className={cn('h-3.5 w-3.5', accent && 'text-[hsl(var(--primary))]')} aria-hidden="true" />
        {label}
      </div>
      <p className={cn(
        'font-mono text-2xl font-bold tabular-nums',
        accent ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]',
      )}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{sub}</p>}
    </div>
  )
}

/* ── Stop confirmation modal ────────────────────────────────── */

function StopModal({ onConfirm, onCancel, loading }: {
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stop-modal-title"
    >
      <div className="w-full max-w-sm rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-xl">
        <div className="mb-4 flex flex-col gap-1.5">
          <h2 id="stop-modal-title" className="text-base font-semibold">
            Stop charging?
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            The session will end and you&apos;ll be billed for the energy used so far.
            Your car will stop receiving charge.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-[6px] border border-[hsl(var(--border))] py-2.5 text-sm font-medium hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
          >
            Keep charging
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-[6px]',
              'bg-[hsl(var(--destructive))] py-2.5 text-sm font-semibold',
              'text-white transition-opacity hover:opacity-90 disabled:opacity-60',
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Stop charging
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────── */

function SessionPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionIdParam = searchParams.get('id')

  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showStop, setShowStop] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState('0:00')

  const isActive = session ? ['preparing', 'charging', 'paused', 'finishing'].includes(session.status) : false
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Fetch session ─────────────────────────────────────────── */
  const fetchSession = useCallback(async () => {
    try {
      let url: string
      if (sessionIdParam) {
        url = `/api/v1/sessions/${sessionIdParam}`
      } else {
        // Find the most recent active session
        const listRes = await fetch('/api/v1/sessions?pageSize=1&status=preparing,charging,paused,finishing,completed')
        if (!listRes.ok) throw new Error('Could not load session')
        const listJson = await listRes.json() as {
          success: boolean
          data: { sessions: { id: string }[] }
        }
        const sessions = listJson.data?.sessions ?? []
        if (sessions.length === 0) {
          router.push('/bookings')
          return
        }
        url = `/api/v1/sessions/${sessions[0]!.id}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 404) { router.push('/bookings'); return }
        throw new Error('Could not load session')
      }
      const json = await res.json() as { success: boolean; data: SessionState }
      if (json.success) setSession(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [sessionIdParam, router])

  /* ── Polling ────────────────────────────────────────────────── */
  useEffect(() => {
    void fetchSession()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchSession])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (isActive) {
      pollRef.current = setInterval(() => { void fetchSession() }, 10_000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [isActive, fetchSession])

  /* ── Elapsed timer ──────────────────────────────────────────── */
  useEffect(() => {
    if (!session?.startedAt || !isActive) return
    const tick = () => setElapsed(fmtDuration(session.startedAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session?.startedAt, isActive])

  /* ── Stop session ───────────────────────────────────────────── */
  const handleStop = async () => {
    if (!session) return
    setStopping(true)
    setStopError(null)
    try {
      const res = await fetch(`/api/v1/sessions/${session.id}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setStopError(json.error?.message ?? 'Could not stop session. Please try again.')
        setStopping(false)
        return
      }
      setShowStop(false)
      // Refresh session state after stop
      await fetchSession()
    } catch {
      setStopError('Network error. Please try again.')
      setStopping(false)
    }
  }

  /* ── Loading / error states ─────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))]" aria-label="Loading session" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading your session…</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-[hsl(var(--destructive))]" aria-hidden="true" />
        <p className="text-sm font-medium">{error ?? 'Session not found'}</p>
        <Link href="/bookings" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
          Back to bookings
        </Link>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG['faulted']!
  const StatusIcon = cfg.icon

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">

      {/* ── Top bar ────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3">
        <Link
          href="/bookings"
          className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          aria-label="Back to bookings"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Bookings
        </Link>
        <div className="flex-1" />
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">
          Live session
        </span>
      </header>

      <main className="flex flex-col gap-6 p-4 pb-24 sm:p-6" id="main-content">

        {/* ── Status banner ─────────────────────────────────────── */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center gap-3 rounded-[6px] px-4 py-3',
            cfg.bgColour,
          )}
        >
          <StatusIcon
            className={cn('h-5 w-5 shrink-0', cfg.colour, cfg.pulse && 'animate-pulse')}
            aria-hidden="true"
          />
          <div className="flex flex-col">
            <span className={cn('text-sm font-semibold', cfg.colour)}>
              {cfg.label}
            </span>
            {session.listingTitle && (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                {session.listingTitle}
                {session.listingCity ? ` · ${session.listingCity}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* ── SoC ring + key metrics ─────────────────────────────── */}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">

          {/* SoC ring */}
          <div className="flex flex-col items-center gap-2">
            <SocRing soc={session.socPercent} status={session.status} />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Battery level</p>
          </div>

          {/* Metrics grid */}
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:flex-1 sm:max-w-xs">
            <MetricCard
              icon={Zap}
              label="Energy"
              value={fmtKwh(session.energyConsumedWh)}
              accent
            />
            <MetricCard
              icon={PoundSterling}
              label="Cost so far"
              value={fmtPence(session.totalCostPence)}
              sub={`${(session.pricePerKwhPence / 100).toFixed(2)}p/kWh`}
              accent
            />
            <MetricCard
              icon={Activity}
              label="Power"
              value={session.powerW != null ? fmtKw(session.powerW) : '—'}
              sub={session.powerW && session.powerW > 0 ? 'Active' : 'Standby'}
            />
            <MetricCard
              icon={Clock}
              label="Duration"
              value={isActive ? elapsed : fmtDuration(session.startedAt)}
              sub={session.startedAt
                ? `Started ${new Date(session.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                : undefined}
            />
          </div>
        </div>

        {/* ── Completed summary ──────────────────────────────────── */}
        {session.status === 'completed' && (
          <div className="rounded-[6px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Charging complete
                </p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {fmtKwh(session.energyConsumedWh)} delivered ·{' '}
                  {fmtPence(session.totalCostPence)} charged
                </p>
                {session.socPercent && (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Battery: {session.socPercent}%
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Fault banner ───────────────────────────────────────── */}
        {session.status === 'faulted' && (
          <div className="rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--destructive))]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--destructive))]">
                  Charger fault detected
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  The charger has reported an issue. The AI is diagnosing the fault and
                  will notify the host. You will not be charged for this session.
                </p>
                <Link
                  href="/help/resolution"
                  className="mt-2 inline-block text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
                >
                  Open a support request →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Session info ───────────────────────────────────────── */}
        <section
          className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]"
          aria-label="Session details"
        >
          {[
            { label: 'Location', value: session.listingTitle ?? '—', icon: MapPin },
            { label: 'Host',     value: session.hostName ?? '—',     icon: Thermometer },
            { label: 'Rate',     value: `${(session.pricePerKwhPence / 100).toFixed(2)}p / kWh`, icon: PoundSterling },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3">
              <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
              <span className="w-20 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
              <span className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{value}</span>
            </div>
          ))}
        </section>

        {/* ── Stop error ─────────────────────────────────────────── */}
        {stopError && (
          <div
            role="alert"
            className="rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]"
          >
            {stopError}
          </div>
        )}

        {/* ── Actions ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {isActive && (
            <button
              type="button"
              onClick={() => setShowStop(true)}
              className={cn(
                'flex h-12 w-full items-center justify-center gap-2 rounded-[6px]',
                'border border-[hsl(var(--destructive)/0.4)] text-sm font-semibold',
                'text-[hsl(var(--destructive))] transition-colors hover:bg-[hsl(var(--destructive)/0.06)]',
              )}
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
              Stop charging
            </button>
          )}
          {session.status === 'completed' && (
            <Link
              href="/bookings"
              className={cn(
                'flex h-12 w-full items-center justify-center rounded-[6px]',
                'bg-[hsl(var(--primary))] text-sm font-semibold',
                'text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
              )}
            >
              Back to bookings
            </Link>
          )}
        </div>

      </main>

      {/* ── Stop confirmation ──────────────────────────────────── */}
      {showStop && (
        <StopModal
          onConfirm={handleStop}
          onCancel={() => setShowStop(false)}
          loading={stopping}
        />
      )}
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
      </div>
    }>
      <SessionPageInner />
    </Suspense>
  )
}
