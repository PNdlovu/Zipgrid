/**
 * @file page.tsx
 * @description /admin/audit — Audit log viewer.
 * Paginated, filterable view of all platform audit events (admin actions,
 * KYC decisions, dispute resolutions, payout runs).
 *
 * @module apps/web/app/(admin)/admin/audit
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList, Loader2, ChevronLeft, ChevronRight, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type AuditRow = {
  id: string
  actorId: string | null
  actorEmail: string | null
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

/* ── Helpers ────────────────────────────────────────────────── */

const ACTION_COLORS: Record<string, string> = {
  dispute_resolved:    'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]',
  listing_approved:    'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]',
  listing_deactivated: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]',
  listing_flagged:     'text-amber-600 bg-amber-500/10',
  kyc_verified:        'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]',
  kyc_rejected:        'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]',
  user_suspended:      'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]',
  user_activated:      'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]',
  payout_run:          'text-blue-600 bg-blue-500/10',
  gdpr_export:         'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]',
  gdpr_delete:         'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]',
}

function actionColor(action: string) {
  return ACTION_COLORS[action] ?? 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]'
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function humanAction(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ── Page ───────────────────────────────────────────────────── */

/**
 * Audit log viewer page.
 */
export default function AdminAuditPage() {
  const [rows, setRows]   = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage]   = useState(1)
  const PAGE_SIZE = 50

  const [search, setSearch]     = useState('')
  const [action, setAction]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  /* ── Fetch ─────────────────────────────────────────────── */

  const fetchRows = useCallback(async (p: number, q: string, a: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (q.trim()) params.set('search', q.trim())
      if (a.trim()) params.set('action', a.trim())

      const res = await fetch(`/api/v1/admin/audit?${params}`)
      if (!res.ok) throw new Error('Failed to load audit log')
      const json = await res.json() as {
        success: boolean
        data: { rows: AuditRow[]; total: number }
      }
      if (json.success) {
        setRows(json.data.rows)
        setTotal(json.data.total)
      }
    } catch {
      setError('Could not load audit log. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRows(page, search, action)
  }, [fetchRows, page, search, action])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
          All admin actions, KYC decisions, and compliance events
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by actor email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className={cn(
              'h-9 w-full rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--background))] pl-9 pr-3 text-sm',
              'focus:border-[hsl(var(--primary))] focus:outline-none',
            )}
          />
        </div>

        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
          className={cn(
            'h-9 rounded-[6px] border border-[hsl(var(--border))]',
            'bg-[hsl(var(--background))] px-3 text-sm',
            'focus:border-[hsl(var(--primary))] focus:outline-none',
          )}
          aria-label="Filter by action type"
        >
          <option value="">All actions</option>
          {Object.keys(ACTION_COLORS).map((a) => (
            <option key={a} value={a}>{humanAction(a)}</option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading audit log" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No audit events found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                  {['Timestamp', 'Actor', 'Action', 'Resource', 'IP'].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {fmtDatetime(row.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-[hsl(var(--foreground))]">{row.actorEmail ?? '(system)'}</p>
                      {row.actorId && (
                        <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                          {row.actorId.slice(0, 8)}…
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', actionColor(row.action))}>
                        {humanAction(row.action)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {row.resourceType && (
                        <p className="text-xs text-[hsl(var(--foreground))]">{row.resourceType}</p>
                      )}
                      {row.resourceId && (
                        <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                          {row.resourceId.slice(0, 12)}…
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {row.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-[hsl(var(--muted-foreground))]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-[hsl(var(--muted-foreground))]">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
