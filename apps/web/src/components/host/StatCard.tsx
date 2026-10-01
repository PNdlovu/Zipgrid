/**
 * @file StatCard.tsx
 * @description KPI stat card for host and admin dashboards.
 * Shows a metric value, label, optional trend, and icon.
 * @module components/host
 */

import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type TrendDirection = 'up' | 'down' | 'flat'

type StatCardProps = {
  label: string
  value: string | number
  /** Optional sub-value or unit label (e.g. "/month") */
  unit?: string
  /** Change value shown as trend indicator (e.g. "+12%" or "3 more") */
  change?: string
  trend?: TrendDirection
  icon?: LucideIcon
  /** Colour override for positive trends (default: primary) */
  positiveIsGood?: boolean
  className?: string
}

const trendConfig: Record<TrendDirection, { icon: LucideIcon; colorGood: string; colorBad: string }> = {
  up:   { icon: TrendingUp,   colorGood: 'text-[hsl(var(--primary))]',       colorBad: 'text-[hsl(var(--destructive))]' },
  down: { icon: TrendingDown, colorGood: 'text-[hsl(var(--destructive))]',   colorBad: 'text-[hsl(var(--primary))]' },
  flat: { icon: Minus,        colorGood: 'text-[hsl(var(--muted-foreground))]', colorBad: 'text-[hsl(var(--muted-foreground))]' },
}

/** KPI metric card — icon, value, label, optional trend indicator. */
export function StatCard({
  label,
  value,
  unit,
  change,
  trend,
  icon: Icon,
  positiveIsGood = true,
  className,
}: StatCardProps) {
  const trendCfg = trend ? trendConfig[trend] : null
  const TrendIcon = trendCfg?.icon

  const trendColor = trendCfg
    ? (trend === 'up' && positiveIsGood) || (trend === 'down' && !positiveIsGood)
      ? trendCfg.colorGood
      : trendCfg.colorBad
    : ''

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          {label}
        </p>
        {Icon && (
          <Icon className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">
          {value}
        </span>
        {unit && (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{unit}</span>
        )}
      </div>

      {/* Trend */}
      {change && TrendIcon && (
        <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
          <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {change}
        </div>
      )}
    </div>
  )
}
