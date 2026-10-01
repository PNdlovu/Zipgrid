/**
 * @file EmptyState.tsx
 * @description Reusable empty state with icon, title, description, and optional CTA.
 * @module components/shared
 */

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/** Empty list/page state with optional icon, text, and call-to-action. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-[8px]',
        'border border-dashed border-[hsl(var(--border))] px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <Icon
          className="h-10 w-10 text-[hsl(var(--muted-foreground)/0.4)]"
          aria-hidden="true"
          strokeWidth={1}
        />
      )}
      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
