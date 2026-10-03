/**
 * @file page.tsx
 * @description /host/chargers/[chargerId]/maintenance — Full maintenance log.
 * Loads the complete maintenance history for a charger device, allows hosts
 * to add new entries (inspection, repair, firmware update, or general note),
 * and links back to the charger detail page.
 *
 * API:
 *   GET  /api/v1/chargers/[chargerId]/maintenance        — paginated log
 *   POST /api/v1/chargers/[chargerId]/maintenance        — add entry
 *
 * @module apps/web/app/(host)/chargers/[chargerId]/maintenance
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Wrench, Plus, Loader2, AlertTriangle,
  ClipboardList, RefreshCw, CheckCircle2, Zap, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type MaintenanceType = 'inspection' | 'repair' | 'firmware' | 'other'

type Entry = {
  id: string
  note: string
  type: MaintenanceType
  createdAt: string
}

/* ── Constants ──────────────────────────────────────────────── */

const TYPE_CONFIG: Record<MaintenanceType, { label: string; icon: React.ElementType; classes: string }> = {
  inspection: {
    label: 'Inspection',
    icon: CheckCircle2,
    classes: 'bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]',
  },
  repair: {
    label: 'Repair',
    icon: Wrench,
    classes: 'bg-[hsl(var(--destructive)/0.08)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)]',
  },
  firmware: {
    label: 'Firmware',
    icon: Zap,
    classes: 'bg-blue-500/10 text-blue-600 border-blue-400/30',
  },
  other: {
    label: 'Note',
    icon: ClipboardList,
    classes: 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]',
  },
}

const ALL_TYPES = Object.keys(TYPE_CONFIG) as MaintenanceType[]

/* ── Helpers ────────────────────────────────────────────────── */

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365)return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /chargers/[chargerId]/maintenance — Full maintenance log. */
export default function MaintenanceLogPage({
  params,
}: {
  params: Promise<{ chargerId: string }>
}) {
  const { chargerId } = use(params)

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* Add-entry form */
  const [note, setNote] = useState('')
  const [type, setType] = useState<MaintenanceType>('other')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  /* Filter */
  const [filterType, setFilterType] = useState<MaintenanceType | 'all'>('all')
  const [search, setSearch] = useState('')

  /* ── Fetch ── */
  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/chargers/${encodeURIComponent(chargerId)}/maintenance?limit=100`)
      if (!res.ok) throw new Error('Failed to load maintenance log')
      const json = (await res.json()) as { data: Entry[] }
      setEntries(json.data ?? [])
    } catch {
      setError('Could not load maintenance log. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [chargerId])

  useEffect(() => { void fetchEntries() }, [fetchEntries])

  /* ── Add entry ── */
  async function handleAdd() {
    if (!note.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch(`/api/v1/chargers/${encodeURIComponent(chargerId)}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim(), type }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        throw new Error(body.error?.message ?? 'Failed to add entry')
      }
      const json = (await res.json()) as { data: Entry }
      setEntries((prev) => [json.data, ...prev])
      setNote('')
      setType('other')
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setAdding(false)
    }
  }

  /* ── Filtered view ── */
  const visible = entries.filter((e) => {
    if (filterType !== 'all' && e.type !== filterType) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!e.note.toLowerCase().includes(q) && !e.type.includes(q)) return false
    }
    return true
  })

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" aria-label="Loading maintenance log" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/host/chargers/${encodeURIComponent(chargerId)}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to charger"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Maintenance log</h1>
          <p className="mt-0.5 truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">
            {chargerId}
          </p>
        </div>
        <button
          onClick={() => { void fetchEntries() }}
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Refresh log"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* ── Add entry form ── */}
      <section aria-labelledby="add-entry-heading" className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h2 id="add-entry-heading" className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
          Add maintenance entry
        </h2>

        {addError && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)/0.08)] px-4 py-2.5 text-sm text-[hsl(var(--destructive))]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {addError}
          </div>
        )}

        {/* Type selector */}
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Entry type">
          {ALL_TYPES.map((t) => {
            const cfg = TYPE_CONFIG[t]
            const Icon = cfg.icon
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                  type === t
                    ? cfg.classes
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]',
                )}
                aria-pressed={type === t}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* Note input + submit */}
        <div className="flex gap-2">
          <label htmlFor="maintenance-note-full" className="sr-only">Maintenance note</label>
          <textarea
            id="maintenance-note-full"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { void handleAdd() }
            }}
            placeholder="Describe the work done, findings, or next steps…"
            maxLength={1000}
            className={cn(
              'flex-1 resize-none rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
              'px-3.5 py-2.5 text-sm placeholder:text-[hsl(var(--muted-foreground))]',
              'focus:border-[hsl(var(--primary))] focus:outline-none',
            )}
          />
          <button
            type="button"
            onClick={() => { void handleAdd() }}
            disabled={adding || !note.trim()}
            className={cn(
              'flex shrink-0 items-center gap-2 self-end rounded-[6px] bg-[hsl(var(--primary))]',
              'px-4 py-2.5 text-sm font-semibold text-white transition-opacity',
              'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {adding
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Plus className="h-4 w-4" aria-hidden="true" />
            }
            Add
          </button>
        </div>
        <p className="mt-1.5 text-right text-[10px] text-[hsl(var(--muted-foreground))]">
          {note.length}/1000 · ⌘↵ to submit
        </p>
      </section>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className={cn(
              'h-9 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
              'pl-9 pr-3.5 text-sm placeholder:text-[hsl(var(--muted-foreground))]',
              'focus:border-[hsl(var(--primary))] focus:outline-none',
            )}
          />
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filterType === 'all'
                ? 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]',
            )}
            aria-pressed={filterType === 'all'}
          >
            All ({entries.length})
          </button>
          {ALL_TYPES.map((t) => {
            const count = entries.filter((e) => e.type === t).length
            if (count === 0) return null
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filterType === t
                    ? TYPE_CONFIG[t].classes
                    : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]',
                )}
                aria-pressed={filterType === t}
              >
                {TYPE_CONFIG[t].label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)/0.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ── Log entries ── */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[8px] border border-dashed border-[hsl(var(--border))] p-12 text-center">
          <Wrench className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              {entries.length === 0 ? 'No maintenance entries yet' : 'No entries match your filter'}
            </p>
            {entries.length === 0 && (
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                Add your first entry above to start tracking inspections, repairs, and firmware updates.
              </p>
            )}
          </div>
        </div>
      ) : (
        <ol role="list" className="relative flex flex-col gap-0" aria-label="Maintenance log entries">
          {/* Timeline line */}
          <li aria-hidden="true" className="pointer-events-none absolute left-[19px] top-6 bottom-6 w-px bg-[hsl(var(--border))]" />

          {visible.map((entry, idx) => {
            const cfg = TYPE_CONFIG[entry.type]
            const Icon = cfg.icon
            return (
              <li
                key={entry.id}
                className={cn(
                  'relative flex gap-4 pb-6',
                  idx === visible.length - 1 && 'pb-0',
                )}
              >
                {/* Timeline dot */}
                <span
                  className={cn(
                    'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                    cfg.classes,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>

                {/* Content */}
                <div className="flex flex-1 flex-col gap-1 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      cfg.classes,
                    )}>
                      {cfg.label}
                    </span>
                    <time
                      dateTime={entry.createdAt}
                      title={fmtDateTime(entry.createdAt)}
                      className="text-xs text-[hsl(var(--muted-foreground))]"
                    >
                      {fmtRelative(entry.createdAt)} · {fmtDateTime(entry.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--foreground))] whitespace-pre-wrap">
                    {entry.note}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
