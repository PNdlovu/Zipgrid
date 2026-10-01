/**
 * @file ChargerStatusBadge.tsx
 * @description OCPP charger status badge — shows connected/faulted/offline state.
 * @module components/host
 */

import { Wifi, WifiOff, AlertTriangle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

type ChargerStatus =
  | 'Available'
  | 'Preparing'
  | 'Charging'
  | 'SuspendedEVSE'
  | 'SuspendedEV'
  | 'Finishing'
  | 'Reserved'
  | 'Unavailable'
  | 'Faulted'
  | 'Rebooting'
  | 'offline'

const STATUS_CONFIG: Record<ChargerStatus, {
  label: string
  icon: React.ElementType
  color: string
  bg: string
}> = {
  Available:     { label: 'Available',    icon: Wifi,          color: 'text-[hsl(var(--primary))]',       bg: 'bg-[hsl(var(--primary)/0.08)]' },
  Preparing:     { label: 'Preparing',    icon: Zap,           color: 'text-yellow-600',                  bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  Charging:      { label: 'Charging',     icon: Zap,           color: 'text-[hsl(var(--primary))]',       bg: 'bg-[hsl(var(--primary)/0.08)]' },
  SuspendedEVSE: { label: 'Suspended',    icon: WifiOff,       color: 'text-yellow-600',                  bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  SuspendedEV:   { label: 'EV paused',    icon: WifiOff,       color: 'text-yellow-600',                  bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  Finishing:     { label: 'Finishing',    icon: Zap,           color: 'text-blue-600',                    bg: 'bg-blue-50 dark:bg-blue-900/20' },
  Reserved:      { label: 'Reserved',     icon: Wifi,          color: 'text-blue-600',                    bg: 'bg-blue-50 dark:bg-blue-900/20' },
  Unavailable:   { label: 'Unavailable',  icon: WifiOff,       color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
  Faulted:       { label: 'Fault',        icon: AlertTriangle, color: 'text-[hsl(var(--destructive))]',   bg: 'bg-[hsl(var(--destructive)/0.08)]' },
  Rebooting:     { label: 'Rebooting',    icon: WifiOff,       color: 'text-yellow-600',                  bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  offline:       { label: 'Offline',      icon: WifiOff,       color: 'text-[hsl(var(--destructive))]',   bg: 'bg-[hsl(var(--destructive)/0.08)]' },
}

const FALLBACK = {
  label: 'Unknown',
  icon: WifiOff,
  color: 'text-[hsl(var(--muted-foreground))]',
  bg: 'bg-[hsl(var(--secondary))]',
}

type ChargerStatusBadgeProps = {
  status: string
  /** Show animated pulse dot for charging state */
  animated?: boolean
  className?: string
}

/** OCPP charger status badge with icon and colour. */
export function ChargerStatusBadge({ status, animated = true, className }: ChargerStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status as ChargerStatus] ?? FALLBACK
  const Icon = cfg.icon
  const showPulse = animated && status === 'Charging'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        cfg.bg,
        cfg.color,
        className,
      )}
    >
      {showPulse ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary))] opacity-75" aria-hidden="true" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
        </span>
      ) : (
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      {cfg.label}
    </span>
  )
}
