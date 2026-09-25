/**
 * @file theme-toggle.tsx
 * @description Three-way theme toggle: Light | Dark | Night.
 * Accessible — keyboard navigable, clear ARIA labels, visible focus ring.
 * Used in the main navigation bar.
 *
 * @module apps/web/components/ui
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon, SunMoon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type ThemeOption = {
  value: string
  label: string
  icon: React.FC<{ className?: string }>
  ariaLabel: string
}

const THEMES: ThemeOption[] = [
  { value: 'light', label: 'Light', icon: Sun, ariaLabel: 'Switch to light mode' },
  { value: 'dark', label: 'Dark', icon: Moon, ariaLabel: 'Switch to dark mode' },
  { value: 'night', label: 'Night', icon: SunMoon, ariaLabel: 'Switch to night mode' },
]

/**
 * Three-way theme toggle button group.
 * Renders nothing during SSR to avoid hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — render only after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={cn('h-9 w-[108px] rounded-[6px]', className)} aria-hidden="true" />
  }

  return (
    <div
      role="group"
      aria-label="Theme selection"
      className={cn(
        'flex items-center gap-0 rounded-[6px] border border-[hsl(var(--border))] p-0.5',
        className,
      )}
    >
      {THEMES.map(({ value, label, icon: Icon, ariaLabel }) => {
        const isActive = theme === value
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            aria-label={ariaLabel}
            aria-pressed={isActive}
            title={label}
            className={cn(
              'flex h-7 w-8 items-center justify-center rounded-[4px] transition-colors',
              'min-h-[28px] min-w-[32px]',
              isActive
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
