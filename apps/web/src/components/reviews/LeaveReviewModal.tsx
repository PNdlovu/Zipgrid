/**
 * @file LeaveReviewModal.tsx
 * @description Modal for submitting a listing review after a completed booking.
 * Renders a 5-star overall rating, five optional sub-rating rows
 * (accuracy, reliability, location, value, communication), and a comment field.
 * POSTs to /api/v1/reviews on submit.
 *
 * @module components/reviews
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import { X, Star, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

export type LeaveReviewModalProps = {
  bookingId: string
  listingId: string
  listingTitle: string
  onClose: () => void
  onSubmitted?: () => void
}

type SubRating = {
  key: 'ratingAccuracy' | 'ratingReliability' | 'ratingLocation' | 'ratingValue' | 'ratingCommunication'
  label: string
}

/* ── Constants ──────────────────────────────────────────────── */

const SUB_RATINGS: SubRating[] = [
  { key: 'ratingAccuracy',      label: 'Accuracy' },
  { key: 'ratingReliability',   label: 'Reliability' },
  { key: 'ratingLocation',      label: 'Location' },
  { key: 'ratingValue',         label: 'Value' },
  { key: 'ratingCommunication', label: 'Communication' },
]

/* ── Star picker ────────────────────────────────────────────── */

function StarPicker({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number
  onChange: (n: number) => void
  size?: 'sm' | 'md' | 'lg'
  label: string
}) {
  const [hovered, setHovered] = useState(0)
  const iconSize = size === 'lg' ? 'h-8 w-8' : size === 'md' ? 'h-6 w-6' : 'h-4 w-4'
  const active = hovered > 0 ? hovered : value

  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
        >
          <Star
            className={cn(
              iconSize,
              'transition-colors',
              n <= active
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-none text-[hsl(var(--border))]',
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}

/* ── Modal ──────────────────────────────────────────────────── */

/** Modal for rating a completed booking (listing review). */
export function LeaveReviewModal({
  bookingId,
  listingId,
  listingTitle,
  onClose,
  onSubmitted,
}: LeaveReviewModalProps) {
  const [overallRating, setOverallRating] = useState(0)
  const [subRatings, setSubRatings] = useState<Partial<Record<SubRating['key'], number>>>({})
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function setSubRating(key: SubRating['key'], value: number) {
    setSubRatings((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overallRating === 0) {
      setError('Please select an overall rating.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'listing',
          bookingId,
          listingId,
          overallRating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          ...subRatings,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        throw new Error(body.error?.message ?? 'Failed to submit review')
      }
      setDone(true)
      onSubmitted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      {/* Dimmed bg */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-t-[16px] bg-[hsl(var(--background))] px-5 pb-8 pt-5 shadow-xl sm:rounded-[16px]">

        {/* Handle (mobile) */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[hsl(var(--border))] sm:hidden" aria-hidden="true" />

        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="review-modal-title" className="text-base font-semibold text-[hsl(var(--foreground))]">
              Rate your session
            </h2>
            <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))] line-clamp-1">
              {listingTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Success state */}
        {done ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            <div>
              <p className="text-base font-semibold text-[hsl(var(--foreground))]">Review submitted</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Your review will be published once both sides have submitted, or after 14 days.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[6px] bg-[hsl(var(--primary))] px-6 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>

            {/* Overall rating */}
            <div className="mb-5 flex flex-col items-center gap-2">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Overall rating</p>
              <StarPicker
                value={overallRating}
                onChange={setOverallRating}
                size="lg"
                label="Overall rating"
              />
              {overallRating > 0 && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][overallRating]}
                </p>
              )}
            </div>

            {/* Sub-ratings */}
            <div className="mb-5 space-y-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Detailed ratings (optional)
              </p>
              {SUB_RATINGS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[hsl(var(--foreground))]">{label}</span>
                  <StarPicker
                    value={subRatings[key] ?? 0}
                    onChange={(n) => setSubRating(key, n)}
                    size="sm"
                    label={label}
                  />
                </div>
              ))}
            </div>

            {/* Comment */}
            <div className="mb-5">
              <label htmlFor="review-comment" className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
                Your review <span className="text-[hsl(var(--muted-foreground))]">(optional)</span>
              </label>
              <textarea
                id="review-comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={2000}
                placeholder="Describe your experience — charger reliability, ease of access, host communication…"
                className={cn(
                  'w-full resize-none rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
                  'px-3.5 py-2.5 text-sm placeholder:text-[hsl(var(--muted-foreground))]',
                  'focus:border-[hsl(var(--primary))] focus:outline-none',
                )}
              />
              <p className="mt-1 text-right text-[10px] text-[hsl(var(--muted-foreground))]">
                {comment.length}/2000
              </p>
            </div>

            {/* Error */}
            {error && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-[6px] bg-[hsl(var(--destructive)/0.08)] px-4 py-2.5 text-sm text-[hsl(var(--destructive))]">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || overallRating === 0}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                'text-sm font-semibold text-white transition-opacity hover:opacity-90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Submitting…</>
                : 'Submit review'
              }
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
