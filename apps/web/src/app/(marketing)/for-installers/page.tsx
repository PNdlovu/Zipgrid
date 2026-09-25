/**
 * @file page.tsx
 * @description For Installers marketing page — /for-installers
 * OZEV-certified installers and hardware vendors listing on the marketplace.
 *
 * @module apps/web/app/(marketing)/for-installers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Wrench,
  TrendingUp,
  Star,
  CalendarCheck,
  ShieldCheck,
  Package,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'For Installers — List Your EV Installer Business on Zipgrid',
  description:
    'OZEV-certified EV charger installers: list your business on Zipgrid, receive job bookings, and reach customers who are ready to buy.',
  alternates: { canonical: 'https://zipgrid.co.uk/for-installers' },
}

const INSTALLER_FEATURES = [
  {
    icon: TrendingUp,
    title: 'Inbound job leads',
    description:
      'Customers searching for an installer on Zipgrid are ready to buy — not just browsing. You receive pre-qualified job requests.',
  },
  {
    icon: CalendarCheck,
    title: 'Booking management',
    description:
      'Manage your calendar, quote jobs, confirm bookings, and invoice — all within the platform. No more WhatsApp threads.',
  },
  {
    icon: Star,
    title: 'Verified reviews',
    description:
      'Only customers who completed a job can review you. No fake ratings. Genuine reputation building over time.',
  },
  {
    icon: ShieldCheck,
    title: 'OZEV badge',
    description:
      'Verified OZEV-certified installers get a badge on their profile. Customers filter for certified installers by default.',
  },
  {
    icon: Package,
    title: 'Hardware sales',
    description:
      'List EV chargers and accessories for sale alongside your installation service. One checkout, one review.',
  },
  {
    icon: Wrench,
    title: 'Agentic maintenance referrals',
    description:
      'Zipgrid\'s AI diagnoses charger faults and automatically recommends the nearest verified installer. You get the lead.',
  },
] as const

const INSTALLER_STEPS = [
  { step: '01', title: 'Create your profile', description: 'Add your qualifications, service area, brands you install, and photos of completed jobs.' },
  { step: '02', title: 'Get verified', description: 'Upload your OZEV certification. We verify within 48 hours. Verified profiles rank higher in search.' },
  { step: '03', title: 'Receive job requests', description: 'Customers in your area send you job requests through the platform. You quote, they book.' },
  { step: '04', title: 'Get paid', description: 'Payment clears automatically on job completion. No invoice chasing. No late payments.' },
] as const

const INSTALLER_BENEFITS = [
  'Free to list — no monthly subscription fee',
  'Only pay a platform fee on completed jobs (not leads)',
  'Customers are homeowners actively buying, not browsing',
  'AI-referred maintenance jobs require no marketing spend',
  'Appears in Zipgrid app search for all nearby customers',
  'Rating system builds a portable, verifiable reputation',
] as const

/**
 * For Installers page — marketplace value proposition for OZEV installers.
 */
export default function ForInstallersPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="For installers hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              For Installers
            </span>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              More jobs.{' '}
              <span className="text-[hsl(var(--primary))]">Less chasing.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              List your OZEV-certified installer business on Zipgrid. Reach customers who are
              actively searching to buy — not browsing. Manage bookings, quotes, and payments
              from one dashboard.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/auth/register?role=installer"
                className={cn(
                  'flex min-h-[48px] items-center rounded-[6px] bg-[hsl(var(--primary))] px-7 py-3',
                  'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                )}
              >
                List your business
              </Link>
              <Link
                href="#how-it-works"
                className="flex min-h-[48px] items-center gap-2 px-7 py-3 text-base font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                How it works <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Free to list · Platform fee applies only on completed jobs
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section
        id="how-it-works"
        aria-label="How to list as an installer"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Getting started" headline="On the platform in 48 hours." />
          <ol
            aria-label="Steps to list as an installer"
            className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
          >
            {INSTALLER_STEPS.map(({ step, title, description }) => (
              <li key={step} className="flex flex-col gap-4">
                <span className="font-mono text-4xl font-bold text-[hsl(var(--primary)/0.25)]" aria-hidden="true">
                  {step}
                </span>
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h3>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section
        aria-label="Installer platform features"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Features" headline="Built for working installers." />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {INSTALLER_FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFITS ─────────────────────────────────────────────── */}
      <section
        aria-label="Installer benefits"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Why Zipgrid"
            headline="Your reputation. Portable and permanent."
            subtext="Your rating on Zipgrid follows you — it's tied to your certification, not to a platform you might leave."
          />
          <ul role="list" className="mt-10 grid gap-3 sm:grid-cols-2">
            {INSTALLER_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                <span className="text-sm text-[hsl(var(--foreground))]">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBanner
        headline="Join the Zipgrid installer marketplace."
        subtext="List your business today. Free to start, no monthly subscription."
        primaryLabel="List my installer business"
        primaryHref="/auth/register?role=installer"
        secondaryLabel="View pricing"
        secondaryHref="/pricing"
      />
    </>
  )
}
