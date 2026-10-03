/**
 * @file layout.tsx
 * @description Marketplace route group layout — top nav with categories + cart icon.
 * Public (no auth required to browse). Cart requires auth.
 *
 * @module apps/web/app/(marketplace)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, Wrench, Zap, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/marketplace', label: 'All Products', icon: Package, exact: true },
  { href: '/marketplace?category=ev-chargers', label: 'EV Chargers', icon: Zap, exact: false },
  { href: '/marketplace?category=charging-cables', label: 'Cables', icon: Zap, exact: false },
  { href: '/marketplace/installers', label: 'Find an Installer', icon: Wrench, exact: false },
] as const

/** Layout for the (marketplace) route group — Marketplace route group layout — top nav with categories + cart icon. */
export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="Zipgrid home">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]">
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Marketplace</span>
          </Link>

          <Link
            href="/marketplace/cart"
            className="flex items-center gap-1.5 rounded-[6px] border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
            aria-label="View cart"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Cart
          </Link>
        </div>

        {/* Category tabs */}
        <nav
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 scrollbar-none"
          aria-label="Marketplace categories"
        >
          {TABS.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact
              ? pathname === '/marketplace' && !pathname.includes('installers')
              : pathname.startsWith(href.split('?')[0]!)
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
