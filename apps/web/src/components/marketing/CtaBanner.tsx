/**
 * @file CtaBanner.tsx
 * @description Repeated CTA section used throughout marketing pages.
 * Two CTAs: primary action + secondary link. Segment-aware copy.
 * Clean border background — no coloured sections, greyscale only.
 *
 * @module apps/web/components/marketing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

type CtaBannerProps = {
  headline: string
  subtext?: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel?: string
  secondaryHref?: string
  className?: string
}

/**
 * Full-width CTA banner with primary + optional secondary action.
 * @param props.headline - Main CTA heading
 * @param props.primaryLabel - Primary button text
 * @param props.primaryHref - Primary button href
 * @param props.secondaryLabel - Secondary link text
 * @param props.secondaryHref - Secondary link href
 */
export function CtaBanner({
  headline,
  subtext,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  className,
}: CtaBannerProps) {
  return (
    <section
      aria-label={headline}
      className={cn(
        'border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary))]',
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
          {headline}
        </h2>
        {subtext && (
          <p className="max-w-xl text-base text-[hsl(var(--muted-foreground))]">{subtext}</p>
        )}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href={primaryHref}
            className={cn(
              'rounded-[6px] bg-[hsl(var(--primary))] px-6 py-3 text-sm font-semibold',
              'text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]',
              'focus-visible:outline-offset-2 min-h-[44px] flex items-center',
            )}
          >
            {primaryLabel}
          </Link>
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className={cn(
                'rounded-[6px] px-6 py-3 text-sm font-medium text-[hsl(var(--muted-foreground))]',
                'transition-colors hover:text-[hsl(var(--foreground))] min-h-[44px] flex items-center',
              )}
            >
              {secondaryLabel} →
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
