/**
 * @file Navbar.tsx
 * @description Main navigation bar for marketing/public pages.
 * Logo left · Nav centre (desktop) / hamburger (mobile) · CTA right.
 * Accessible: keyboard navigable, skip-to-content link, ARIA landmarks.
 * Sticky on scroll with border-bottom separator.
 *
 * @module apps/web/components/marketing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Zap } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/for-drivers', label: 'For Drivers' },
  { href: '/for-homeowners', label: 'For Homeowners' },
  { href: '/for-businesses', label: 'For Businesses' },
  { href: '/for-installers', label: 'For Installers' },
  { href: '/pricing', label: 'Pricing' },
] as const

/**
 * Marketing Navbar — renders on all public pages before login.
 */
export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      {/* Skip to main content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[6px] focus:bg-[hsl(var(--primary))] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      <header
        role="banner"
        className={cn(
          'sticky top-0 z-40 w-full border-b bg-[hsl(var(--background))]',
          scrolled
            ? 'border-[hsl(var(--border))]'
            : 'border-transparent',
          'transition-[border-color] duration-200',
        )}
      >
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        >
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]"
            aria-label="Zipgrid home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]" aria-hidden="true">
              <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Zipgrid
            </span>
          </Link>

          {/* Desktop nav links */}
          <ul
            role="list"
            className="hidden items-center gap-1 lg:flex"
          >
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'rounded-[6px] px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]',
                    )}
                  >
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Right side: theme toggle + CTA */}
          <div className="flex items-center gap-3">
            <ThemeToggle className="hidden sm:flex" />

            {/* Desktop CTAs */}
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/auth/login"
                className="rounded-[6px] px-4 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
              >
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className={cn(
                  'rounded-[6px] bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium',
                  'text-[hsl(var(--primary-foreground))] transition-opacity',
                  'hover:opacity-90 focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                )}
              >
                Get started free
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileOpen((v) => !v)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-[6px] lg:hidden',
                'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]',
                'hover:text-[hsl(var(--foreground))] transition-colors',
              )}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <div
            id="mobile-menu"
            role="navigation"
            aria-label="Mobile navigation"
            className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 pb-4 pt-2 lg:hidden"
          >
            <ul role="list" className="flex flex-col gap-1">
              {NAV_LINKS.map(({ href, label }) => {
                const isActive = pathname === href
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex rounded-[6px] px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]',
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 flex flex-col gap-2 border-t border-[hsl(var(--border))] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  Theme
                </span>
                <ThemeToggle />
              </div>
              <Link
                href="/auth/login"
                className={cn(
                  'flex items-center justify-center rounded-[6px] border border-[hsl(var(--border))]',
                  'px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))]',
                  'hover:bg-[hsl(var(--secondary))] transition-colors',
                )}
              >
                Sign in
              </Link>
              <Link
                href="/auth/register"
                className={cn(
                  'flex items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]',
                  'px-4 py-2.5 text-sm font-medium text-[hsl(var(--primary-foreground))]',
                  'hover:opacity-90 transition-opacity',
                )}
              >
                Get started free
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  )
}
