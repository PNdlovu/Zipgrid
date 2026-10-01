/**
 * @file SessionMonitor.tsx
 * @description Live session metrics display — kWh, cost, power, SoC, elapsed time.
 * Used by the active session screen and host session overview.
 * @module components/session
 */

import { Zap, Clock, PoundSterling, Battery } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SessionMetrics = {
  energyConsumedWh: number
  totalCostPence: number
  powerW: number | null
  socPercent: number | null
  pricePerKwhPence: number
  startedAt: string | null
  status: string
}

type SessionMonitorProps = {
  metrics: SessionMetrics
  elapsed?: string
  className?: string
}

/** Primary kWh counter with secondary metrics grid. */
export function SessionMonitor({ metrics, elapsed, className }: SessionMonitorProps) {
  const kwhDelivered = metrics.energyConsumedWh / 1000
  const costPounds = metrics.totalCostPence / 100
  const powerKw = metrics.powerW != null ? metrics.powerW / 1000 : null
  const isCharging = metrics.status === 'charging'

  return (
    <div className={cn('flex flex-col items-center gap-8', className)}>
      {/* Primary metric */}
      <div className="flex flex-col items-center gap-1.5">
        <Zap
          className={cn(
            'h-10 w-10',
            isCharging ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]',
          )}
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <span
          className="font-mono text-6xl font-bold tabular-nums text-[hsl(var(--foreground))]"
          aria-label={`${kwhDelivered.toFixed(2)} kilowatt-hours delivered`}
        >
          {kwhDelivered.toFixed(2)}
        </span>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">kWh delivered</span>
      </div>

      {/* Secondary metrics */}
      <div className="grid w-full max-w-sm grid-cols-3 gap-4">
        <MetricCell
          label="Cost"
          value={`£${costPounds.toFixed(2)}`}
          icon={PoundSterling}
        />
        <MetricCell
          label="Duration"
          value={elapsed ?? '—'}
          icon={Clock}
        />
        <MetricCell
          label={powerKw != null ? 'Power' : 'Rate'}
          value={powerKw != null ? `${powerKw.toFixed(1)}kW` : `${metrics.pricePerKwhPence}p/kWh`}
          icon={Zap}
        />
      </div>

      {/* SoC bar */}
      {metrics.socPercent != null && (
        <div className="w-full max-w-sm">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
              <Battery className="h-3.5 w-3.5" aria-hidden="true" />
              Battery
            </span>
            <span className="font-mono font-semibold">{metrics.socPercent}%</span>
          </div>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]"
            role="progressbar"
            aria-valuenow={metrics.socPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Battery state of charge"
          >
            <div
              className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-1000"
              style={{ width: `${metrics.socPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCell({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ElementType
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-4">
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="font-mono text-lg font-bold text-[hsl(var(--foreground))]">{value}</span>
      <Icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
    </div>
  )
}
