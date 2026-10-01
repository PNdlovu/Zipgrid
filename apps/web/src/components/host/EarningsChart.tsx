/**
 * @file EarningsChart.tsx
 * @description Simple CSS-only bar chart for host earnings by period.
 * No external chart library — avoids bundle weight for a single chart.
 * For more complex charts, swap with Recharts or Chart.js.
 * @module components/host
 */

import { cn } from '@/lib/utils'

export type EarningsPeriod = {
  label: string   // e.g. "Jan", "Week 1"
  valuePence: number
  sessionCount?: number
}

type EarningsChartProps = {
  periods: EarningsPeriod[]
  /** Display currency symbol prefix (default: £) */
  currencySymbol?: string
  /** Height of the tallest bar in px (default: 80) */
  maxBarHeightPx?: number
  className?: string
}

function formatPence(pence: number): string {
  if (pence >= 100_00) return `£${Math.round(pence / 100)}` // £100+: no decimals
  return `£${(pence / 100).toFixed(0)}`
}

/** Responsive CSS bar chart for earnings data — no dependencies. */
export function EarningsChart({
  periods,
  currencySymbol = '£',
  maxBarHeightPx = 80,
  className,
}: EarningsChartProps) {
  if (periods.length === 0) {
    return (
      <div className={cn('flex items-center justify-center rounded-[8px] border border-dashed border-[hsl(var(--border))] p-6', className)}>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No earnings data yet.</p>
      </div>
    )
  }

  const maxValue = Math.max(...periods.map((p) => p.valuePence), 1)

  return (
    <div className={cn('flex items-end gap-2', className)} role="img" aria-label="Earnings bar chart">
      {periods.map((period) => {
        const heightPct = (period.valuePence / maxValue) * 100
        const barHeight = Math.max(4, Math.round((heightPct / 100) * maxBarHeightPx))
        const isMax = period.valuePence === maxValue

        return (
          <div
            key={period.label}
            className="group flex flex-1 flex-col items-center gap-1"
            title={`${period.label}: ${currencySymbol}${(period.valuePence / 100).toFixed(2)}${period.sessionCount != null ? ` (${period.sessionCount} sessions)` : ''}`}
          >
            {/* Value label on hover */}
            <span
              className={cn(
                'text-[10px] font-semibold transition-opacity',
                isMax
                  ? 'text-[hsl(var(--primary))] opacity-100'
                  : 'text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100',
              )}
              aria-hidden="true"
            >
              {formatPence(period.valuePence)}
            </span>

            {/* Bar */}
            <div
              className={cn(
                'w-full rounded-t-[4px] transition-all',
                isMax
                  ? 'bg-[hsl(var(--primary))]'
                  : 'bg-[hsl(var(--primary)/0.35)] group-hover:bg-[hsl(var(--primary)/0.6)]',
              )}
              style={{ height: `${barHeight}px` }}
              role="presentation"
            />

            {/* Period label */}
            <span className="truncate text-[10px] text-[hsl(var(--muted-foreground))]" aria-hidden="true">
              {period.label}
            </span>
          </div>
        )
      })}

      {/* Screen-reader table */}
      <table className="sr-only">
        <caption>Earnings by period</caption>
        <thead><tr><th>Period</th><th>Amount</th></tr></thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.label}>
              <td>{p.label}</td>
              <td>{currencySymbol}{(p.valuePence / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
