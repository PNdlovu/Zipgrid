/**
 * @file page.tsx
 * @description /admin/payouts — Payout management dashboard.
 * Shows pending batch summary, recent payout batches, and a
 * manual "Run payout" trigger for the current or a custom period.
 *
 * @module apps/web/app/(admin)/admin/payouts
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PoundSterling, Play, RefreshCw, CheckCircle2, AlertTriangle, Clock, Loader2, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type PayoutOverview = {
  pendingBatches: number
  pendingTotalPence: number
  recentBatches: BatchRow[]
}

type BatchRow = {
  id: string
  hostUserId: string
  periodStart: string
  periodEnd: string
  netEarningsPence: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processedAt: string | null
  stripeTransferId: string | null
}

type RunResult = {
  period: { start: string; end: string }
  scheduled: number
  processed: number
  failed: number
  message: string
}

/* ── Helpers ────────────────────────────────────────────────── */

function fmt(pence: number) { return `£${(pence / 100).toFixed(2)}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_CONFIG: Record<BatchRow['status'], { label: string; icon: React.ElementType; cls: string }> = {
  pending:    { label: 'Pending',    icon: Clock,         cls: 'text-amber-600 bg-amber-500/10' },
  processing: { label: 'Processing', icon: RefreshCw,     cls: 'text-blue-600 bg-blue-500/10' },
  completed:  { label: 'Paid',       icon: CheckCircle2,  cls: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' },
  failed:     { label: 'Failed',     icon: AlertTriangle, cls: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]' },
}

/* ── Page ───────────────────────────────────────────────────── */

/**
 * Admin payout management page.
 */
export default function AdminPayoutsPage() {
  const [overview, setOverview] = useState<PayoutOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  /* ── Fetch ─────────────────────────────────────────────── */

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/payouts')
      if (!res.ok) throw new Error('Failed to load payout data')
      const json = await res.json() as { success: boolean; data: PayoutOverview }
      if (json.success) setOverview(json.data)
    } catch {
      setError('Could not load payout overview. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchOverview() }, [fetchOverview])

  /* ── Run payout ────────────────────────────────────────── */

  const handleRunPayout = async () => {
    setRunning(true)
    setRunResult(null)
    setRunError(null)
    try {
      const res = await fetch('/api/v1/admin/payouts', { method: 'POST' })
      const json = await res.json() as { success: boolean; data?: RunResult; error?: { message: string } }
      if (!res.ok || !json.success) {
        setRunError(json.error?.message ?? 'Payout run failed')
        return
      }
      setRunResult(json.data!)
      void fetchOverview()
    } catch {
      setRunError('Network error — payout run failed')
    } finally {
      setRunning(false)
    }
  }

  /* ── Render ────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
            Weekly host disbursements via Stripe Connect
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunPayout}
          disabled={running}
          aria-busy={running}
          className={cn(
            'flex items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2.5',
            'text-sm font-semibold text-[hsl(var(--primary-foreground))]',
            'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Running…</>
            : <><Play className="h-4 w-4" aria-hidden="true" /> Run payout now</>}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      )}

      {/* Run result banner */}
      {runResult && (
        <div className="mb-6 rounded-[6px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Payout run complete
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--foreground))]">{runResult.message}</p>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            {[
              { label: 'Period',    value: `${fmtDate(runResult.period.start)} – ${fmtDate(runResult.period.end)}` },
              { label: 'Scheduled', value: String(runResult.scheduled) },
              { label: 'Processed', value: String(runResult.processed) },
              { label: 'Failed',    value: String(runResult.failed) },
            ].map(({ label, value }) => (
              <div key={label}>
                <span className="text-[hsl(var(--muted-foreground))]">{label}: </span>
                <span className="font-semibold text-[hsl(var(--foreground))]">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {runError && (
        <div role="alert" className="mb-6 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {runError}
        </div>
      )}

      {overview && (
        <>
          {/* Pending summary cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: 'Pending batches',
                value: String(overview.pendingBatches),
                icon: Clock,
                accent: overview.pendingBatches > 0,
              },
              {
                label: 'Pending total',
                value: fmt(overview.pendingTotalPence),
                icon: PoundSterling,
                accent: true,
              },
              {
                label: 'Recent batches shown',
                value: String(overview.recentBatches.length),
                icon: ArrowUpRight,
                accent: false,
              },
            ].map(({ label, value, icon: Icon, accent }) => (
              <div
                key={label}
                className="flex items-center gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
              >
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px]',
                  accent ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
                )} aria-hidden="true">
                  <Icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
                  <p className="font-mono text-xl font-bold text-[hsl(var(--foreground))]">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Recent batches table */}
          <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="border-b border-[hsl(var(--border))] px-5 py-4">
              <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recent payout batches</h2>
            </div>

            {overview.recentBatches.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <PoundSterling className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" strokeWidth={1.5} />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No payout batches yet.</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Click &quot;Run payout now&quot; to process this week&apos;s earnings.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                      {['Period', 'Amount', 'Status', 'Processed', 'Transfer ID'].map((h) => (
                        <th key={h} className="px-5 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {overview.recentBatches.map((batch) => {
                      const cfg = STATUS_CONFIG[batch.status]
                      const StatusIcon = cfg.icon
                      return (
                        <tr key={batch.id} className="hover:bg-[hsl(var(--muted)/0.4)] transition-colors">
                          <td className="px-5 py-3 font-medium">
                            {fmtDate(batch.periodStart)} – {fmtDate(batch.periodEnd)}
                          </td>
                          <td className="px-5 py-3 font-mono font-semibold">{fmt(batch.netEarningsPence)}</td>
                          <td className="px-5 py-3">
                            <span className={cn('flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', cfg.cls)}>
                              <StatusIcon className="h-3 w-3" aria-hidden="true" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[hsl(var(--muted-foreground))]">
                            {batch.processedAt ? fmtDate(batch.processedAt) : '—'}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                            {batch.stripeTransferId
                              ? <span title={batch.stripeTransferId}>{batch.stripeTransferId.slice(0, 20)}…</span>
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
