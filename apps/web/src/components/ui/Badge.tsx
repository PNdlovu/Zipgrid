/**
 * @file Badge.tsx
 * @description Shared badge/pill component with variant colours.
 * @module components/ui
 */

import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'outline'

const variantClasses: Record<BadgeVariant, string> = {
  default:     'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]',
  primary:     'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]',
  success:     'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  warning:     'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  destructive: 'bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]',
  outline:     'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
}

type BadgeProps = {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

/** Compact pill badge for status indicators, labels, and tags. */
export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
