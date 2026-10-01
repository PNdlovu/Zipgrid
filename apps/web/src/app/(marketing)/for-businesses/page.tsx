/**
 * @file page.tsx
 * @description For Businesses marketing page — /for-businesses
 * SMB dashboard, multi-charger management, dynamic pricing, analytics.
 *
 * @module apps/web/app/(marketing)/for-businesses
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BarChart3,
  Users,
  Settings,
  PoundSterling,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle2,
  Building2,
  TrendingUp,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'For Businesses — EV Charging Management for SMBs',
  description:
    'Multi-charger dashboard, dynamic pricing, access control, and analytics for businesses. Turn your car park into a revenue stream.',
  alternates: { canonical: 'https://zipgrid.co.uk/for-businesses' },
}

const SMB_FEATURES = [
  {
    icon: BarChart3,
    title: 'Live analytics dashboard',
    description:
      'See revenue, sessions, utilisation, and peak hours in real time. Exportable reports for accounting.',
  },
  {
    icon: Settings,
    title: 'Dynamic pricing',
    description:
      'AI suggests peak pricing automatically. Set different rates for weekdays, weekends, and bank holidays.',
  },
  {
    icon: Users,
    title: 'Access control',
    description:
      'Employee-only mode, whitelist/blacklist by driver, or open to all. RFID and PIN support.',
  },
  {
    icon: Zap,
    title: 'Multi-charger management',
    description:
      'Manage unlimited chargers from one dashboard. Health status, uptime, and fault alerts per device.',
  },
  {
    icon: PoundSterling,
    title: 'Revenue centre tools',
    description:
      'Issue invoices, track VAT, and reconcile session payments. Integrates with Xero and QuickBooks.',
  },
  {
    icon: Shield,
    title: 'Predictive maintenance',
    description:
      'AI monitors every session for fault patterns and automatically flags issues before they become downtime.',
  },
] as const

const SMB_USE_CASES = [
  { icon: Building2, title: 'Retail car parks', desc: 'Attract EV customers. Charge for charging time — a new revenue line from existing infrastructure.' },
  { icon: Users, title: 'Office parking', desc: 'Employee benefit that drives EV adoption. Manage who can charge and when from one dashboard.' },
  { icon: TrendingUp, title: 'Hotels & hospitality', desc: 'Guests expect EV charging. List your bays on Zipgrid and charge guests at market rates.' },
  { icon: Zap, title: 'Fleet depots', desc: 'Smart scheduling ensures every vehicle is charged at the cheapest rate window, every night.' },
] as const

const SMB_GUARANTEES = [
  'Unlimited chargers per account on Pro and Enterprise plans',
  'Role-based access — assign managers without sharing admin credentials',
  'Branded access page for your car park (custom URL)',
  'SLA-backed support on Enterprise — 4-hour response',
  'API access for integration with your existing systems',
  'GDPR-compliant — all data processed in EU (Amsterdam)',
] as const

/**
 * For Businesses page — SMB and commercial operator value proposition.
 */
export default function ForBusinessesPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="For businesses hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              For Businesses
            </span>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              Turn your car park into{' '}
              <span className="text-[hsl(var(--primary))]">a revenue stream.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              Multi-charger dashboard, dynamic pricing, access control, and live analytics — all
              in one platform. Built for SMBs that want to run EV charging like a proper business.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/register?role=host&type=smb"
                className={cn(
                  'flex min-h-[48px] items-center rounded-[6px] bg-[hsl(var(--primary))] px-7 py-3',
                  'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                )}
              >
                Get started
              </Link>
              <Link
                href="/pricing"
                className="flex min-h-[48px] items-center gap-2 px-7 py-3 text-base font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                View business pricing <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── USE CASES ────────────────────────────────────────────── */}
      <section
        aria-label="Business use cases"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Use cases"
            headline="Any business with EV chargers."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {SMB_USE_CASES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-5 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.1)]" aria-hidden="true">
                  <Icon className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SMB FEATURES ─────────────────────────────────────────── */}
      <section
        aria-label="Business platform features"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="The platform"
            headline="Everything you need. Nothing you don't."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SMB_FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── GUARANTEES ───────────────────────────────────────────── */}
      <section
        aria-label="Business guarantees"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Built for business"
            headline="Enterprise-grade. SMB-friendly."
            subtext="No lock-in, transparent pricing, and the security controls your IT team will ask for."
          />
          <ul role="list" className="mt-10 grid gap-3 sm:grid-cols-2">
            {SMB_GUARANTEES.map((g) => (
              <li key={g} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                <span className="text-sm text-[hsl(var(--foreground))]">{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBanner
        headline="Ready to run EV charging as a business?"
        subtext="Get started free. Upgrade to Pro or Enterprise when your volumes grow."
        primaryLabel="Start your business account"
        primaryHref="/register?role=host&type=smb"
        secondaryLabel="See pricing"
        secondaryHref="/pricing"
      />
    </>
  )
}
