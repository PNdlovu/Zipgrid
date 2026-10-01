/**
 * @file BookingStatusBadge.tsx
 * @description Pill badge for booking status with consistent colour coding.
 * @module components/booking
 */

import { cn } from '@/lib/utils'

type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled_by_driver'
  | 'cancelled_by_host'
  | 'cancelled_by_platform'
  | 'no_show'

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  pending:               { label: 'Awaiting confirmation', color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  confirmed:             { label: 'Confirmed',             color: 'text-[hsl(var(--primary))]',           bg: 'bg-[hsl(var(--primary)/0.08)]' },
  active:                { label: 'Session active',        color: 'text-[hsl(var(--primary))]',           bg: 'bg-[hsl(var(--primary)/0.08)]' },
  completed:             { label: 'Completed',             color: 'text-[hsl(var(--muted-foreground))]',  bg: 'bg-[hsl(var(--secondary))]' },
  cancelled_by_driver:   { label: 'Cancelled by you',      color: 'text-[hsl(var(--destructive))]',       bg: 'bg-[hsl(var(--destructive)/0.08)]' },
  cancelled_by_host:     { label: 'Cancelled by host',     color: 'text-[hsl(var(--destructive))]',       bg: 'bg-[hsl(var(--destructive)/0.08)]' },
  cancelled_by_platform: { label: 'Cancelled',             color: 'text-[hsl(var(--destructive))]',       bg: 'bg-[hsl(var(--destructive)/0.08)]' },
  no_show:               { label: 'No show',               color: 'text-[hsl(var(--muted-foreground))]',  bg: 'bg-[hsl(var(--secondary))]' },
}

const FALLBACK = { label: 'Unknown', color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' }

type BookingStatusBadgeProps = {
  status: string
  className?: string
}

/** Pill badge that displays a booking status with appropriate colour. */
export function BookingStatusBadge({ status, className }: BookingStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as BookingStatus] ?? FALLBACK
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        cfg.bg,
        cfg.color,
        className,
      )}
    >
      {cfg.label}
    </span>
  )
}
