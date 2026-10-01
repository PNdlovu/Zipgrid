/**
 * @file layout.tsx
 * @description Platform admin portal layout — dark-accented sidebar.
 * Route group is protected by both middleware (auth) and per-page
 * role checks (admin role required on every API call).
 *
 * @module apps/web/app/(admin)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Zap, LayoutDashboard, Users, MapPin, MessageSquareWarning,
  BarChart3, ClipboardList, Menu, X, ChevronRight, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/users',     icon: Users,            label: 'Users' },
  { href: '/admin/listings',  icon: MapPin,           label: 'Listings' },
  { href: '/admin/disputes',  icon: MessageSquareWarning, label: 'Disputes' },
  { href: '/admin/payouts',   icon: BarChart3,        label: 'Payouts' },
  { href: '/admin/audit',     icon: ClipboardList,    label: 'Audit Log' },
] as const

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col',
          'border-r border-[hsl(var(--border))] bg-[hsl(var(--background))]',
          'transition-transform duration-200 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Admin navigation"
      >
        {/* Wordmark */}
        <div className="flex h-16 items-center justify-between border-b border-[hsl(var(--border))] px-5">
          <Link href="/" className="flex items-center gap-2" aria-label="Zipgrid home">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]">
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[hsl(var(--foreground))]">Zipgrid</span>
          </Link>
          <button onClick={() => setOpen(false)} className="rounded-[6px] p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] lg:hidden" aria-label="Close sidebar">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Role badge */}
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-5 py-3">
          <Shield className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
            Admin Portal
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Admin menu">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={1.5} />
                {label}
                {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-[hsl(var(--border))] p-4">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Internal use only. All actions are logged.</p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-5">
          <button onClick={() => setOpen(true)} className="rounded-[6px] p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] lg:hidden" aria-label="Open sidebar">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="ml-3 hidden text-xs font-medium text-[hsl(var(--muted-foreground))] lg:block">
            Platform Administration
          </span>
        </header>
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>{children}</main>
      </div>
    </div>
  )
}
