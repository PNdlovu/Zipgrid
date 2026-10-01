/**
 * @file LoadingState.tsx
 * @description Reusable loading spinner/skeleton for pages and sections.
 * @module components/shared
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type LoadingStateProps = {
  /** Centre in a full-height container (default true) */
  fullHeight?: boolean
  /** Accessible label for screen readers */
  label?: string
  className?: string
}

/** Full-page or inline loading spinner. */
export function LoadingState({
  fullHeight = true,
  label = 'Loading…',
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        fullHeight && 'min-h-[60vh]',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2
        className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

/** Rectangular skeleton block for layout-preserving loading states. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-[6px] bg-[hsl(var(--secondary))]', className)}
      aria-hidden="true"
    />
  )
}
