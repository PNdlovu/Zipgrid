/**
 * @file page.tsx
 * @description /admin/disputes — Dispute queue with case management.
 * Shows all disputes with status filter, inline resolution actions,
 * and resolution notes input.
 *
 * @module apps/web/app/(admin)/admin/disputes
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MessageSquareWarning, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, CheckCircle2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type DisputeRow = {
  id: string; status: string; dispute_type: string; created_at: string
  raised_by_name: string | null; raised_by_email: string | null
  raised_against_name: string | null; booking_id: string | null
  scheduled_start: string | null; listing_title: string | null
  refund_amount_cents: number | null; resolution_notes: string | null
}

/* ── Status config ───────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open:                    { label: 'Open',              color: 'text-yellow-600',                 bg: 'bg-yellow-500/10' },
  under_review:            { label: 'Under review',      color: 'text-blue-600',                   bg: 'bg-blue-500/10' },
  awaiting_evidence:       { label: 'Awaiting evidence', color: 'text-yellow-600',                 bg: 'bg-yellow-500/10' },
  escalated:               { label: 'Escalated',         color: 'text-[hsl(var(--destructive))]',  bg: 'bg-[hsl(var(--destructive)/0.08)]' },
  resolved_driver_favour:  { label: 'Resolved (driver)', color: 'text-[hsl(var(--primary))]',      bg: 'bg-[hsl(var(--primary)/0.1)]' },
  resolved_host_favour:    { label: 'Resolved (host)',   color: 'text-[hsl(var(--primary))]',      bg: 'bg-[hsl(var(--primary)/0.1)]' },
  resolved_split:          { label: 'Resolved (split)',  color: 'text-[hsl(var(--primary))]',      bg: 'bg-[hsl(var(--primary)/0.1)]' },
  closed:                  { label: 'Closed',            color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  safety_incident: 'SAFETY', session_fault: 'Charger fault', charger_unavailable: 'Charger unavailable',
  billing: 'Billing', property_damage: 'Property damage', driver_behaviour: 'Behaviour',
  billing_overcharge: 'Billing overcharge', charger_not_working: 'Charger not working',
  host_no_access: 'Host: no access', driver_damage: 'Driver damage',
  driver_no_show: 'Driver no-show', host_cancelled: 'Host cancelled', other: 'Other',
}

const OPEN_STATUSES = new Set(['open', 'under_review', 'awaiting_evidence', 'escalated'])

/* ── Resolution modal ────────────────────────────────────────── */

function ResolveModal({
  dispute,
  onResolve,
  onClose,
}: {
  dispute: DisputeRow
  onResolve: (action: string, notes: string, refundPence?: number) => void
  onClose: () => void
}) {
  const [action, setAction] = useState('')
  const [notes, setNotes] = useState('')
  const [refundPence, setRefundPence] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!action) return
    setSubmitting(true)
    onResolve(action, notes, refundPence ? Math.round(parseFloat(refundPence) * 100) : undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
      <div className="w-full max-w-md rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="resolve-title" className="font-semibold text-[hsl(var(--foreground))]">Resolve dispute</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="font-medium text-[hsl(var(--foreground))]">{dispute.raised_by_name ?? 'Unknown'}</span>
          {' vs '}<span className="font-medium text-[hsl(var(--foreground))]">{dispute.raised_against_name ?? 'Unknown'}</span>
          {' · '}{DISPUTE_TYPE_LABELS[dispute.dispute_type] ?? dispute.dispute_type}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="action" className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Resolution</label>
            <select id="action" value={action} onChange={(e) => setAction(e.target.value)} required
              className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]">
              <option value="">Select outcome…</option>
              <option value="resolve_driver">Resolve in driver&apos;s favour</option>
              <option value="resolve_host">Resolve in host&apos;s favour</option>
              <option value="resolve_split">Split resolution</option>
              <option value="escalate">Escalate</option>
              <option value="close">Close without resolution</option>
            </select>
          </div>

          {(action === 'resolve_driver' || action === 'resolve_split') && (
            <div>
              <label htmlFor="refund" className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Refund amount (£)</label>
              <input id="refund" type="number" min="0" step="0.01" value={refundPence} onChange={(e) => setRefundPence(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]" />
            </div>
          )}

          <div>
            <label htmlFor="notes" className="mb-1 block text-xs font-medium text-[hsl(var(--foreground))]">Resolution notes</label>
            <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000}
              placeholder="Document the evidence reviewed and reasoning…"
              className="w-full resize-none rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]" />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex-1 rounded-[6px] border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--foreground))] disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !action} aria-busy={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

const PAGE_SIZE = 25

/** Page at /admin/disputes — Dispute queue with case management. */
export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [resolving, setResolving] = useState<DisputeRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchDisputes = useCallback(async (p: number) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/v1/admin/disputes?${params}`)
      const json = await res.json() as { success: boolean; data?: DisputeRow[]; meta?: { total?: number }; error?: { message: string } }
      if (json.success) { setDisputes(json.data ?? []); setTotal(json.meta?.total ?? 0) }
      else setError(json.error?.message ?? 'Failed to load')
    } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { setPage(1); void fetchDisputes(1) }, [fetchDisputes])

  const handleResolve = async (action: string, notes: string, refundPence?: number) => {
    if (!resolving) return
    setActionError(null)
    try {
      const res = await fetch('/api/v1/admin/disputes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId: resolving.id, action, resolutionNotes: notes, refundAmountPence: refundPence }),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!json.success) { setActionError(json.error?.message ?? 'Action failed'); return }
      setResolving(null)
      void fetchDisputes(page)
    } catch { setActionError('Network error. Please try again.') }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Disputes</h1>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{total} case{total !== 1 ? 's' : ''}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"
            className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="under_review">Under review</option>
            <option value="escalated">Escalated</option>
            <option value="resolved_driver_favour">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {(error || actionError) && (
          <div className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-3">
            <AlertCircle className="h-4 w-4 text-[hsl(var(--destructive))]" aria-hidden="true" />
            <p className="text-sm text-[hsl(var(--destructive))]">{error ?? actionError}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" /></div>
        ) : disputes.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <MessageSquareWarning className="h-12 w-12 text-[hsl(var(--muted-foreground)/0.3)]" aria-hidden="true" strokeWidth={1} />
            <div>
              <p className="font-medium text-[hsl(var(--foreground))]">No disputes found</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {statusFilter ? 'No disputes with this status.' : 'All clear — no disputes at the moment.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {disputes.map((d) => {
              const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG['open']!
              const isOpen = OPEN_STATUSES.has(d.status)
              return (
                <div key={d.id} className="flex items-start gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {DISPUTE_TYPE_LABELS[d.dispute_type] ?? d.dispute_type}
                      </span>
                      <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="text-[hsl(var(--foreground))]">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">From: </span>
                        {d.raised_by_name ?? d.raised_by_email ?? 'Unknown'}
                      </span>
                      {d.raised_against_name && (
                        <span className="text-[hsl(var(--foreground))]">
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">Against: </span>
                          {d.raised_against_name}
                        </span>
                      )}
                      {d.listing_title && (
                        <span className="text-[hsl(var(--foreground))]">
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">Listing: </span>
                          {d.listing_title}
                        </span>
                      )}
                    </div>
                    {d.resolution_notes && (
                      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))] italic">&quot;{d.resolution_notes}&quot;</p>
                    )}
                  </div>
                  {isOpen && (
                    <button
                      type="button"
                      onClick={() => { setActionError(null); setResolving(d) }}
                      className={cn(
                        'shrink-0 rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5',
                        'text-xs font-medium text-[hsl(var(--foreground))] transition-colors',
                        'hover:border-[hsl(var(--primary)/0.4)] hover:text-[hsl(var(--primary))]',
                      )}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { const p = page - 1; setPage(p); void fetchDisputes(p) }} disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => { const p = page + 1; setPage(p); void fetchDisputes(p) }} disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] disabled:opacity-40" aria-label="Next page">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {resolving && (
        <ResolveModal dispute={resolving} onResolve={handleResolve} onClose={() => setResolving(null)} />
      )}
    </>
  )
}
