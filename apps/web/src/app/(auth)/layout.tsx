/**
 * @file layout.tsx
 * @description Auth layout — split-panel design.
 * Left panel: branded value proposition (desktop only).
 * Right panel: auth form content.
 * Mobile: full-width form only.
 *
 * @module apps/web/app/(auth)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import Link from 'next/link'
import { Zap, CheckCircle2 } from 'lucide-react'

const BRAND_POINTS = [
  'Find affordable EV charging near you',
  'Earn from your idle home charger',
  'AI scheduling — cheapest rate, automatically',
  'Voice control, hands-free in your car',
  '£1M Host Protection Guarantee',
] as const

/**
 * Auth layout — branded split panel.
 * @param props.children - Auth form page content (right panel)
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      {/* ── LEFT PANEL (desktop only) ─────────────────────────── */}
      <div className="relative hidden w-1/2 flex-col justify-between border-r border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-10 lg:flex xl:p-14">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="Zipgrid home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold text-[hsl(var(--foreground))]">Zipgrid</span>
        </Link>

        {/* Main copy */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              UK EV Charging Ecosystem
            </span>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight text-[hsl(var(--foreground))] xl:text-5xl">
              The smarter way to charge.
            </h2>
            <p className="max-w-sm text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
              Join thousands of UK drivers and homeowners already using Zipgrid to save money and
              earn passively.
            </p>
          </div>

          <ul role="list" className="flex flex-col gap-3">
            {BRAND_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3">
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <span className="text-sm text-[hsl(var(--foreground))]">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom testimonial */}
        <figure className="flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <blockquote>
            <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]">
              &ldquo;Listed my Zappi in 10 minutes. Earned £127 in the first month with zero effort.&rdquo;
            </p>
          </blockquote>
          <figcaption className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-xs font-semibold text-[hsl(var(--foreground))]"
              aria-hidden="true"
            >
              SC
            </div>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Sarah C. · Homeowner host · Earlsfield
            </span>
          </figcaption>
        </figure>
      </div>

      {/* ── RIGHT PANEL — form content ────────────────────────── */}
      <div className="flex w-full flex-col lg:w-1/2">
        {/* Mobile logo */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4 lg:hidden">
          <Link href="/" className="flex items-center gap-2" aria-label="Zipgrid home">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[hsl(var(--primary))]">
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-[hsl(var(--foreground))]">Zipgrid</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            ← Back
          </Link>
        </div>

        {/* Form area */}
        <main
          id="main-content"
          className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10"
          tabIndex={-1}
        >
          <div className="w-full max-w-md">{children}</div>
        </main>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 border-t border-[hsl(var(--border))] px-6 py-4">
          {[
            { href: '/legal/privacy', label: 'Privacy' },
            { href: '/legal/terms', label: 'Terms' },
            { href: '/help', label: 'Help' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
