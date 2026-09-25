/**
 * @file FeatureCard.tsx
 * @description Feature highlight card used in marketing sections.
 * Icon + heading + description. Clean border, no drop shadow.
 *
 * @module apps/web/components/marketing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { cn } from '@/lib/utils'

import type { LucideIcon } from 'lucide-react'

type FeatureCardProps = {
  icon: LucideIcon
  title: string
  description: string
  className?: string
}

/**
 * Feature card with icon, title, and description.
 * @param props.icon - Lucide icon component
 * @param props.title - Feature name
 * @param props.description - One-sentence explanation
 */
export function FeatureCard({ icon: Icon, title, description, className }: FeatureCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))]',
        'bg-[hsl(var(--card))] p-6 transition-colors',
        'hover:border-[hsl(var(--primary)/0.4)]',
        className,
      )}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.1)]"
        aria-hidden="true"
      >
        <Icon
          className="h-5 w-5 text-[hsl(var(--primary))]"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h3>
        <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          {description}
        </p>
      </div>
    </div>
  )
}
