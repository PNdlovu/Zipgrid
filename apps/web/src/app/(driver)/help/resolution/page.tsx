/**
 * @file page.tsx
 * @description /driver/help/resolution — Driver-facing Resolution Centre.
 * Allows drivers to raise a dispute on a completed booking, upload evidence,
 * and track the case status through its lifecycle.
 *
 * @module apps/web/app/(driver)/help/resolution
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock,
  Upload, FileText, MessageSquare, ChevronRight,
  Loader2, X, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type DisputeCategory = 'session_fault' | 'property_damage' | 'billing' | 'driver_behaviour' | 'charger_unavailable' | 'other'

type CaseStatus =
  | 'open'
  | 'evidence_requested'
  | 'evidence_received'
  | 'under_review'
  | 'resolved_driver_favour'
  | 'resolved_host_favour'
  | 'resolved_split'
  | 'closed'
  | 'escalated'

type DisputeCase = {
  id: string
  status: CaseStatus
  disputeType: DisputeCategory
  bookingId: string | null
  listingTitle: string | null
  raisedAt: string
  updatedAt: string
  resolutionNotes: string | null
  refundAmountPence: number | null
}

type EvidenceFile = {
  id: string
  fileUrl: string
  fileName: string
  fileType: string
  fileSizeBytes: number
  createdAt: string
}

/* ── Constants ──────────────────────────────────────────────── */

const CATEGORY_OPTIONS: Array<{ value: DisputeCategory; label: string; description: string }> = [
  { value: 'session_fault',       label: 'Charger fault',          description: 'The charger failed during my session' },
  { value: 'charger_unavailable', label: 'Charger unavailable',    description: 'The charger was inaccessible or broken on arrival' },
  { value: 'billing',             label: 'Billing issue',          description: 'I was charged the wrong amount' },
  { value: 'property_damage',     label: 'Property damage',        description: 'Damage to my vehicle or the host\'s property' },
  { value: 'driver_behaviour',    label: 'Host behaviour',         description: 'Concern about the host\'s conduct' },
  { value: 'other',               label: 'Other',                  description: 'Something else went wrong' },
]

const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; bg: string }> = {
  open:                     { label: 'Open',               color: 'text-blue-700',                         bg: 'bg-blue-50 dark:bg-blue-900/20' },
  evidence_requested:       { label: 'Evidence requested', color: 'text-amber-700',                        bg: 'bg-amber-50 dark:bg-amber-900/20' },
  evidence_received:        { label: 'Evidence received',  color: 'text-amber-700',                        bg: 'bg-amber-50 dark:bg-amber-900/20' },
  under_review:             { label: 'Under review',       color: 'text-blue-700',                         bg: 'bg-blue-50 dark:bg-blue-900/20' },
  resolved_driver_favour:   { label: 'Resolved in your favour', color: 'text-[hsl(var(--primary))]',      bg: 'bg-[hsl(var(--primary)/0.08)]' },
  resolved_host_favour:     { label: 'Resolved — host favour',  color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
  resolved_split:           { label: 'Resolved — split decision', color: 'text-[hsl(var(--foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
  escalated:                { label: 'Escalated',          color: 'text-amber-700',                        bg: 'bg-amber-50 dark:bg-amber-900/20' },
  closed:                   { label: 'Closed',             color: 'text-[hsl(var(--muted-foreground))]',  bg: 'bg-[hsl(var(--secondary))]' },
}

const TIMELINE_STEPS = ['Reported', 'Evidence collected', 'Under review', 'Decision made', 'Resolved']

/* ── Helpers ────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timelineIndex(status: CaseStatus): number {
  const map: Record<CaseStatus, number> = {
    open: 0, evidence_requested: 1, evidence_received: 1,
    under_review: 2, escalated: 2,
    resolved_driver_favour: 4, resolved_host_favour: 4, resolved_split: 4, closed: 4,
  }
  return map[status] ?? 0
}

/* ── Page ───────────────────────────────────────────────────── */

export default function ResolutionCentrePage() {
  const [cases, setCases] = useState<DisputeCase[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCase, setActiveCase] = useState<DisputeCase | null>(null)
  const [evidence, setEvidence] = useState<EvidenceFile[]>([])

  // New dispute form
  const [showNewForm, setShowNewForm] = useState(false)
  const [category, setCategory]     = useState<DisputeCategory>('session_fault')
  const [description, setDescription] = useState('')
  const [bookingId, setBookingId]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Evidence upload
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fetchCases = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/disputes?role=driver')
      if (res.ok) {
        const json = await res.json() as { data: DisputeCase[] }
        setCases(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchEvidence = useCallback(async (disputeId: string) => {
    const res = await fetch(`/api/v1/disputes/${disputeId}/evidence`)
    if (res.ok) {
      const json = await res.json() as { data: EvidenceFile[] }
      setEvidence(json.data ?? [])
    }
  }, [])

  useEffect(() => { void fetchCases() }, [fetchCases])
  useEffect(() => {
    if (activeCase) void fetchEvidence(activeCase.id)
    else setEvidence([])
  }, [activeCase, fetchEvidence])

  const handleSubmitCase = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) { setSubmitError('Please describe what happened.'); return }
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/v1/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeType: category,
          description: description.trim(),
          ...(bookingId.trim() ? { bookingId: bookingId.trim() } : {}),
        }),
      })
      const json = await res.json() as { success: boolean; data?: DisputeCase; error?: { message: string } }
      if (!res.ok || !json.success) {
        setSubmitError(json.error?.message ?? 'Failed to submit. Please try again.')
        return
      }
      setShowNewForm(false)
      setDescription('')
      setBookingId('')
      await fetchCases()
      if (json.data) setActiveCase(json.data)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUploadEvidence = async (file: File) => {
    if (!activeCase) return
    setUploading(true)
    setUploadError(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`/api/v1/disputes/${activeCase.id}/evidence`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (!res.ok || !json.success) {
        setUploadError(json.error?.message ?? 'Upload failed. Please try again.')
        return
      }
      await fetchEvidence(activeCase.id)
    } finally {
      setUploading(false)
    }
  }

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" />
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/help"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to help"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Resolution Centre</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Report a problem and track your case</p>
        </div>
        {!activeCase && !showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="ml-auto flex h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] px-3 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Report a problem
          </button>
        )}
      </div>

      {/* New dispute form */}
      {showNewForm && (
        <form onSubmit={handleSubmitCase} className="mb-6 flex flex-col gap-4 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Report a problem</h2>
            <button type="button" onClick={() => setShowNewForm(false)} aria-label="Cancel" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Category */}
          <div>
            <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">What happened?</p>
            <div className="flex flex-col gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-[6px] border p-3 text-sm transition-colors',
                    category === opt.value
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)]',
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={opt.value}
                    checked={category === opt.value}
                    onChange={() => setCategory(opt.value)}
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <div>
                    <p className="font-medium text-[hsl(var(--foreground))]">{opt.label}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Booking ID */}
          <div>
            <label htmlFor="booking-id" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Booking reference (optional)
            </label>
            <input
              id="booking-id"
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder="e.g. 3F7A1B2C"
              className="h-10 w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono text-sm focus:border-[hsl(var(--primary))] focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Describe what happened
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please give as much detail as possible — what happened, when, and what impact it had."
              maxLength={2000}
              className={cn(
                'w-full resize-none rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
                'px-3.5 py-2.5 text-sm placeholder:text-[hsl(var(--muted-foreground))]',
                'focus:border-[hsl(var(--primary))] focus:outline-none',
              )}
            />
            <p className="mt-1 text-right text-[10px] text-[hsl(var(--muted-foreground))]">{description.length}/2000</p>
          </div>

          {submitError && (
            <p role="alert" className="flex items-center gap-2 text-sm text-[hsl(var(--destructive))]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {submitError}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setShowNewForm(false)}
              className="flex-1 rounded-[6px] border border-[hsl(var(--border))] py-2.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} aria-busy={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))] py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Submit case
            </button>
          </div>
        </form>
      )}

      {/* Active case detail */}
      {activeCase && !showNewForm && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setActiveCase(null)}
            className="mb-4 flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to all cases
          </button>

          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            {/* Status + ref */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[hsl(var(--foreground))]">
                  {CATEGORY_OPTIONS.find((c) => c.value === activeCase.disputeType)?.label ?? activeCase.disputeType}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                  Case #{activeCase.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                STATUS_CONFIG[activeCase.status]?.bg,
                STATUS_CONFIG[activeCase.status]?.color,
              )}>
                {STATUS_CONFIG[activeCase.status]?.label}
              </span>
            </div>

            {/* Case timeline */}
            <div className="mb-5">
              <div className="relative flex items-start justify-between">
                {/* Progress bar */}
                <div className="absolute left-4 right-4 top-3 h-0.5 bg-[hsl(var(--border))]" aria-hidden="true">
                  <div
                    className="h-full bg-[hsl(var(--primary))] transition-all"
                    style={{ width: `${(timelineIndex(activeCase.status) / (TIMELINE_STEPS.length - 1)) * 100}%` }}
                  />
                </div>

                {TIMELINE_STEPS.map((step, i) => {
                  const passed = i <= timelineIndex(activeCase.status)
                  return (
                    <div key={step} className="relative z-10 flex flex-1 flex-col items-center gap-1.5">
                      <div className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border-2',
                        passed
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]'
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--background))]',
                      )}>
                        {passed && <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-hidden="true" />}
                      </div>
                      <p className={cn('text-center text-[9px] font-medium leading-tight',
                        passed ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]')}>
                        {step}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Resolution notes */}
            {activeCase.resolutionNotes && (
              <div className="mb-4 rounded-[6px] bg-[hsl(var(--secondary))] p-3">
                <p className="mb-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Decision notes</p>
                <p className="text-sm text-[hsl(var(--foreground))]">{activeCase.resolutionNotes}</p>
                {activeCase.refundAmountPence != null && activeCase.refundAmountPence > 0 && (
                  <p className="mt-2 text-sm font-semibold text-[hsl(var(--primary))]">
                    Refund: £{(activeCase.refundAmountPence / 100).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Evidence section */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Evidence ({evidence.length}/10)
              </h3>

              {evidence.length > 0 && (
                <ul className="mb-3 flex flex-col gap-2">
                  {evidence.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--border))] px-3 py-2.5 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-[hsl(var(--foreground))]">{f.fileName}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {(f.fileSizeBytes / 1024).toFixed(0)} KB · {fmtDate(f.createdAt)}
                        </p>
                      </div>
                      <a href={f.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 text-xs font-medium text-[hsl(var(--primary))] hover:underline">
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {/* Upload button */}
              {['open', 'evidence_requested', 'under_review', 'evidence_received'].includes(activeCase.status) && (
                <div>
                  {uploadError && (
                    <p role="alert" className="mb-2 text-xs text-[hsl(var(--destructive))]">{uploadError}</p>
                  )}
                  <label className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[6px] border-2 border-dashed',
                    'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-4 py-3 text-sm',
                    'text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.4)] hover:text-[hsl(var(--foreground))]',
                    uploading && 'pointer-events-none opacity-60',
                  )}>
                    {uploading
                      ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Uploading…</>
                      : <><Upload className="h-4 w-4" aria-hidden="true" /> Add evidence (photo, video, or PDF)</>}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleUploadEvidence(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Max 10 files · 50 MB total · JPEG, PNG, MP4, PDF
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cases list */}
      {!activeCase && !showNewForm && (
        <div>
          {cases.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-[8px] border border-dashed border-[hsl(var(--border))] py-12 text-center">
              <MessageSquare className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
              <div>
                <p className="font-medium text-[hsl(var(--foreground))]">No active cases</p>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  If something goes wrong with a session, you can report it here.
                </p>
              </div>
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-2">
              {cases.map((c) => {
                const cfg = STATUS_CONFIG[c.status] ?? { label: c.status, color: '', bg: '' }
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveCase(c)}
                      className="flex w-full items-center gap-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3.5 text-left transition-colors hover:bg-[hsl(var(--secondary))]"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                          {CATEGORY_OPTIONS.find((opt) => opt.value === c.disputeType)?.label ?? c.disputeType}
                          {c.listingTitle && <span className="font-normal text-[hsl(var(--muted-foreground))]"> · {c.listingTitle}</span>}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          Opened {fmtDate(c.raisedAt)} · #{c.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
