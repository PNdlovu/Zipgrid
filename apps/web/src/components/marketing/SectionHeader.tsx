/**
 * @file SectionHeader.tsx
 * @description Reusable section header for marketing pages.
 * Eyebrow label + headline + subtext with consistent spacing.
 *
 * @module apps/web/components/marketing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { cn } from '@/lib/utils'

type SectionHeaderProps = {
  eyebrow?: string
  headline: string
  subtext?: string
  align?: 'left' | 'center'
  className?: string
}

/**
 * Marketing section header with optional eyebrow label.
 * @param props.eyebrow - Small label above the headline (e.g. "For drivers")
 * @param props.headline - Main section heading
 * @param props.subtext - Optional supporting paragraph
 * @param props.align - Text alignment (default: 'center')
 */
export function SectionHeader({
  eyebrow,
  headline,
  subtext,
  align = 'center',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
        {headline}
      </h2>
      {subtext && (
        <p className="max-w-2xl text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
          {subtext}
        </p>
      )}
    </div>
  )
}
