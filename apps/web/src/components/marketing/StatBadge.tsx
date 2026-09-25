/**
 * @file StatBadge.tsx
 * @description Social proof stat display — large number + label.
 * Used in hero and proof sections.
 *
 * @module apps/web/components/marketing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

type StatBadgeProps = {
  value: string
  label: string
}

/**
 * Large stat display for social proof sections.
 * @param props.value - The metric value e.g. "500+"
 * @param props.label - The metric label e.g. "Active listings"
 */
export function StatBadge({ value, label }: StatBadgeProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
        {value}
      </span>
      <span className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
    </div>
  )
}
