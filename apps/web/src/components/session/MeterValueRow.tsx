/**
 * @file MeterValueRow.tsx
 * @description Single telemetry row for the session detail view.
 * Shows a measured value with label, unit, and optional trend indicator.
 * @module components/session
 */

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type MeterValueRowProps = {
  icon: LucideIcon
  label: string
  value: string | number | null
  unit?: string
  subtext?: string
  className?: string
}

/** A telemetry row: icon | label — value unit */
export function MeterValueRow({
  icon: Icon,
  label,
  value,
  unit,
  subtext,
  className,
}: MeterValueRowProps) {
  const displayValue = value == null ? '—' : String(value)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-[hsl(var(--border))] py-3',
        'last:border-0',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p>
          {subtext && (
            <p className="text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">{subtext}</p>
          )}
        </div>
      </div>
      <div className="text-right">
        <span className="font-mono text-sm font-semibold text-[hsl(var(--foreground))]">
          {displayValue}
        </span>
        {unit && (
          <span className="ml-0.5 text-xs text-[hsl(var(--muted-foreground))]">{unit}</span>
        )}
      </div>
    </div>
  )
}
