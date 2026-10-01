/**
 * @file page.tsx
 * @description /admin/listings — Listing moderation queue.
 * Paginated table of all listings with status filter, approve/flag/deactivate actions.
 *
 * @module apps/web/app/(admin)/admin/listings
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MapPin, CheckCircle2, AlertTriangle, EyeOff,
  Loader2, ChevronLeft, ChevronRight, Search, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ListingRow = {
  id: string
  title: string
  city: string
  postcode: string
  status: 'active' | 'under_review' | 'draft' | 'deactivated' | 'suspended'
  chargerLevel: string
  maxPowerKw: number
  hostName: string | null
  hostEmail: string | null
  createdAt: string
}

type StatusFilter = '' | 'active' | 'under_review' | 'draft' | 'deactivated' | 'suspended'

/* ── Helpers ────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:       { label: 'Active',       cls: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' },
  under_review: { label: 'Under review', cls: 'text-amber-600 bg-amber-500/10' },
  draft:        { label: 'Draft',        cls: 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]' },
  deactivated:  { label: 'Deactivated',  cls: 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))]' },
  suspended:    { label: 'Suspended',    cls: 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)]' },
}

const CHARGER_LEVEL_LABELS: Record<string, string> = {
  level_1: 'Level 1', level_2: 'Level 2', dc_fast: 'DC Fast', dc_ultra_fast: 'DC Ultra Fast',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Page ───────────────────────────────────────────────────── */

/**
 * Admin listing moderation page.
 */
export default function AdminListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const PAGE_SIZE = 25

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('under_review')
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError]     = useState<string | null>(null)

  /* ── Fetch ─────────────────────────────────────────────── */

  const fetchListings = useCallback(async (p: number, status: StatusFilter, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (status) params.set('status', status)
      if (q.trim()) params.set('search', q.trim())

      const res = await fetch(`/api/v1/admin/listings?${params}`)
      if (!res.ok) throw new Error('Failed to load listings')
      const json = await res.json() as {
        success: boolean
        data: { listings: ListingRow[]; total: number }
      }
      if (json.success) {
        setListings(json.data.listings)
        setTotal(json.data.total)
      }
    } catch {
      setError('Could not load listings. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchListings(page, statusFilter, search)
  }, [fetchListings, page, statusFilter, search])

  /* ── Actions ────────────────────────────────────────────── */

  const handleAction = async (listingId: string, action: 'approve' | 'flag' | 'deactivate') => {
    setActionLoading(listingId + action)
    setActionError(null)
    try {
      const res = await fetch('/api/v1/admin/listings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, action }),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setActionError(json.error?.message ?? 'Action failed')
        return
      }
      void fetchListings(page, statusFilter, search)
    } catch {
      setActionError('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── Pagination ─────────────────────────────────────────── */

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Listings</h1>
        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
          Review, approve, and moderate charger listings
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by title or city…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className={cn(
              'h-9 w-full rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--background))] pl-9 pr-3 text-sm',
              'focus:border-[hsl(var(--primary))] focus:outline-none',
            )}
          />
        </div>

        {/* Status filter */}
        <div role="group" aria-label="Filter by status" className="flex overflow-hidden rounded-[6px] border border-[hsl(var(--border))]">
          {([
            { v: '' as StatusFilter,          l: 'All' },
            { v: 'under_review' as StatusFilter, l: 'Review' },
            { v: 'active' as StatusFilter,    l: 'Active' },
            { v: 'suspended' as StatusFilter, l: 'Suspended' },
          ] as const).map(({ v, l }) => (
            <button
              key={v}
              onClick={() => { setStatusFilter(v); setPage(1) }}
              aria-pressed={statusFilter === v}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === v
                  ? 'bg-[hsl(var(--primary))] text-white'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Error banners */}
      {error && (
        <div role="alert" className="mb-4 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {error}
        </div>
      )}
      {actionError && (
        <div role="alert" className="mb-4 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading listings" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <MapPin className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No listings match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] text-left text-xs text-[hsl(var(--muted-foreground))]">
                  {['Listing', 'Host', 'Charger', 'Status', 'Added', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {listings.map((listing) => {
                  const sc = STATUS_CONFIG[listing.status] ?? STATUS_CONFIG['draft']!
                  const isActing = (action: string) => actionLoading === listing.id + action
                  return (
                    <tr key={listing.id} className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[hsl(var(--foreground))]">{listing.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{listing.city} · {listing.postcode}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-[hsl(var(--foreground))]">{listing.hostName ?? '—'}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{listing.hostEmail ?? ''}</p>
                      </td>
                      <td className="px-5 py-3 text-[hsl(var(--muted-foreground))]">
                        {CHARGER_LEVEL_LABELS[listing.chargerLevel] ?? listing.chargerLevel}
                        <span className="ml-1 font-mono text-xs">{listing.maxPowerKw}kW</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', sc.cls)}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[hsl(var(--muted-foreground))]">
                        {fmtDate(listing.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {listing.status === 'under_review' && (
                            <button
                              type="button"
                              onClick={() => handleAction(listing.id, 'approve')}
                              disabled={actionLoading !== null}
                              className={cn(
                                'flex items-center gap-1.5 rounded-[6px] bg-[hsl(var(--primary))] px-2.5 py-1.5',
                                'text-xs font-semibold text-[hsl(var(--primary-foreground))]',
                                'transition-opacity hover:opacity-90 disabled:opacity-50',
                              )}
                              aria-label={`Approve ${listing.title}`}
                            >
                              {isActing('approve')
                                ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                                : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                              Approve
                            </button>
                          )}
                          {['active', 'under_review'].includes(listing.status) && (
                            <button
                              type="button"
                              onClick={() => handleAction(listing.id, 'flag')}
                              disabled={actionLoading !== null}
                              className={cn(
                                'flex items-center gap-1.5 rounded-[6px] border border-amber-400/40 px-2.5 py-1.5',
                                'text-xs font-semibold text-amber-600',
                                'transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50',
                              )}
                              aria-label={`Flag ${listing.title} for review`}
                            >
                              {isActing('flag')
                                ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                                : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                              Flag
                            </button>
                          )}
                          {listing.status !== 'deactivated' && (
                            <button
                              type="button"
                              onClick={() => handleAction(listing.id, 'deactivate')}
                              disabled={actionLoading !== null}
                              className={cn(
                                'flex items-center gap-1.5 rounded-[6px] border border-[hsl(var(--border))] px-2.5 py-1.5',
                                'text-xs font-semibold text-[hsl(var(--muted-foreground))]',
                                'transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50',
                              )}
                              aria-label={`Deactivate ${listing.title}`}
                            >
                              {isActing('deactivate')
                                ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                                : <EyeOff className="h-3 w-3" aria-hidden="true" />}
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
