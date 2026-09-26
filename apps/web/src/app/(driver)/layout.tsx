/**
 * @file layout.tsx
 * @description Driver portal layout — bottom nav + top bar.
 * Protected route group; middleware guards all (driver)/* routes.
 *
 * @module apps/web/app/(driver)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MapPin, CalendarDays, Zap, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const BOTTOM_NAV = [
  { href: '/map', icon: MapPin, label: 'Map' },
  { href: '/driver/bookings', icon: CalendarDays, label: 'Bookings' },
  { href: '/driver/session', icon: Zap, label: 'Session' },
  { href: '/profile', icon: User, label: 'Profile' },
] as const

/**
 * Driver layout — bottom navigation bar for mobile-first UX.
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      <main id="main-content" className="flex-1 pb-16" tabIndex={-1}>
        {children}
      </main>

      {/* Bottom nav — mobile */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]"
        aria-label="Driver navigation"
      >
        {BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                isActive
                  ? 'text-[hsl(var(--primary))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
