/**
 * @file Footer.tsx
 * @description Site-wide footer for marketing pages.
 * Clean, minimal — links to Privacy, Terms, Security, Accessibility.
 * Social links. Platform status indicator.
 *
 * @module apps/web/components/marketing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import Link from 'next/link'
import { Zap } from 'lucide-react'

const FOOTER_LINKS = {
  Platform: [
    { href: '/for-drivers', label: 'For Drivers' },
    { href: '/for-homeowners', label: 'For Homeowners' },
    { href: '/for-businesses', label: 'For Businesses' },
    { href: '/for-installers', label: 'For Installers' },
    { href: '/pricing', label: 'Pricing' },
  ],
  Resources: [
    { href: '/blog', label: 'Blog' },
    { href: '/help', label: 'Help Centre' },
    { href: '/safety', label: 'Safety & Insurance' },
    { href: '/auth/register', label: 'Get started' },
  ],
  Legal: [
    { href: '/legal/privacy', label: 'Privacy Policy' },
    { href: '/legal/terms', label: 'Terms of Service' },
    { href: '/legal/security', label: 'Security' },
    { href: '/legal/accessibility', label: 'Accessibility' },
  ],
} as const

/**
 * Site footer — renders on all marketing pages.
 */
export function Footer() {
  return (
    <footer
      role="contentinfo"
      className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Top row */}
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link
              href="/"
              className="flex items-center gap-2"
              aria-label="Zipgrid home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]">
                <Zap className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold text-[hsl(var(--foreground))]">
                Zipgrid
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              The UK&apos;s AI-powered EV charging ecosystem. Find charging, earn from your charger,
              and never worry about range again.
            </p>
            <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
              Data stored in EU (Amsterdam) · UK GDPR compliant
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--foreground))]">
                {group}
              </h3>
              <ul role="list" className="flex flex-col gap-2">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-8 sm:flex-row">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            &copy; {new Date().getFullYear()} Zipgrid Ltd. All rights reserved.
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Built in London 🇬🇧
          </p>
        </div>
      </div>
    </footer>
  )
}
