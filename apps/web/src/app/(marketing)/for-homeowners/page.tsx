/**
 * @file page.tsx
 * @description For Homeowners marketing page — /for-homeowners
 * Explains how residential hosts list their charger and earn passive income.
 *
 * @module apps/web/app/(marketing)/for-homeowners
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PoundSterling,
  CalendarDays,
  Zap,
  Shield,
  Brain,
  Settings,
  ArrowRight,
  CheckCircle2,
  Star,
  Clock,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'For Homeowners — Earn From Your Home EV Charger',
  description:
    'List your home EV charger on Zipgrid and earn up to £140/month. Set your hours, set your price — AI handles the scheduling.',
  alternates: { canonical: 'https://zipgrid.co.uk/for-homeowners' },
}

const HOST_FEATURES = [
  {
    icon: CalendarDays,
    title: 'Set your own hours',
    description:
      'Open your listing only when it suits you. Block out your own charging time with one tap. Your schedule, not ours.',
  },
  {
    icon: PoundSterling,
    title: 'You set the price',
    description:
      'Charge by kWh, by hour, or per session. Our AI suggests the optimal price for your area — you approve every change.',
  },
  {
    icon: Brain,
    title: 'Smart scheduling',
    description:
      'Zipgrid automatically blocks your charger when you need it. Tariff-aware scheduling charges your own car at the cheapest rate window.',
  },
  {
    icon: Zap,
    title: 'Works with your charger',
    description:
      'Compatible with EO, Rolec, Andersen, Ohme, Zappi, and Wallbox at launch. If your charger supports OCPP, it works.',
  },
  {
    icon: Shield,
    title: '£1M Host Protection',
    description:
      'Every booking is covered by our Host Protection Guarantee. Verified drivers only. Insurance kicks in if anything goes wrong.',
  },
  {
    icon: Settings,
    title: '10-minute setup',
    description:
      'Link your charger, drop a map pin, set your price. Our voice-guided setup walks you through it. Most hosts are live in under 10 minutes.',
  },
] as const

const SETUP_STEPS = [
  { step: '01', title: 'Link your charger', description: 'Scan the QR code on your device. Zipgrid connects via OCPP and runs a health check automatically.' },
  { step: '02', title: 'Set your listing', description: 'Drop a map pin, add photos, set your price and availability. Our AI suggests a price based on your postcode.' },
  { step: '03', title: 'Go live', description: 'Publish your listing. Drivers can find and book instantly. You get notified and can approve before any session starts.' },
  { step: '04', title: 'Earn passively', description: 'Payouts land in your bank every two weeks. Live earnings dashboard shows exactly what you\'ve made.' },
] as const

const EARNINGS_EXAMPLES = [
  { scenario: 'Weekend only (Fri–Sun)', sessions: '6 sessions/week', perMonth: '£68–£90', perYear: '£816–£1,080' },
  { scenario: 'Evenings only (Mon–Fri)', sessions: '5 sessions/week', perMonth: '£85–£110', perYear: '£1,020–£1,320' },
  { scenario: 'Always open (24/7)', sessions: '14 sessions/week', perMonth: '£120–£160', perYear: '£1,440–£1,920' },
] as const

const HOST_GUARANTEES = [
  'Verified ID on every driver before their first booking',
  'Instant cancellation controls — you can cancel any booking',
  'Automatic dispute resolution with 24h response SLA',
  'Damage covered by Host Protection Guarantee',
  'No-show protection — you are paid even if the driver doesn\'t arrive',
  'Safety score monitoring — problem hosts are auto-paused',
] as const

/**
 * For Homeowners page — explains the host value proposition.
 */
export default function ForHomeownersPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="For homeowners hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              For Homeowners
            </span>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              Your charger earns{' '}
              <span className="text-[hsl(var(--primary))]">while you sleep.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              Your home EV charger sits idle 20 hours a day. List it on Zipgrid, set your hours,
              and earn up to £140/month — with zero effort after setup.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/register?role=host"
                className={cn(
                  'flex min-h-[48px] items-center rounded-[6px] bg-[hsl(var(--primary))] px-7 py-3',
                  'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                )}
              >
                List your charger
              </Link>
              <Link
                href="#earnings"
                className="flex min-h-[48px] items-center gap-2 px-7 py-3 text-base font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                See earnings calculator <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Free to list · No monthly fee · 15% platform commission on earnings only
            </p>
          </div>
        </div>
      </section>

      {/* ── EARNINGS TABLE ───────────────────────────────────────── */}
      <section
        id="earnings"
        aria-label="Earnings examples by availability"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="How much can I earn?"
            headline="Real numbers, not estimates."
            subtext="Based on average booking rates for UK home chargers in 2026. Your earnings depend on location, price, and availability."
          />
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Earnings by availability scenario">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {['Availability', 'Typical sessions', 'Monthly earnings', 'Annual earnings'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="pb-3 pr-8 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] first:pl-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EARNINGS_EXAMPLES.map(({ scenario, sessions, perMonth, perYear }, i) => (
                  <tr
                    key={scenario}
                    className={cn(
                      'border-b border-[hsl(var(--border))]',
                      i === 2 && 'bg-[hsl(var(--primary)/0.03)]',
                    )}
                  >
                    <td className="py-4 pr-8 font-medium text-[hsl(var(--foreground))]">
                      {i === 2 && (
                        <span className="mr-2 rounded-[4px] bg-[hsl(var(--primary)/0.1)] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                          MAX
                        </span>
                      )}
                      {scenario}
                    </td>
                    <td className="py-4 pr-8 text-[hsl(var(--muted-foreground))]">{sessions}</td>
                    <td className="py-4 pr-8 font-mono font-semibold text-[hsl(var(--foreground))]">{perMonth}</td>
                    <td className="py-4 font-mono font-semibold text-[hsl(var(--foreground))]">{perYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            * Based on average 7kW charger at £0.38/kWh, 2-hour sessions. Actual earnings vary by location and pricing.
            Platform commission of 15% applies to all earnings.
          </p>
        </div>
      </section>

      {/* ── HOW SETUP WORKS ──────────────────────────────────────── */}
      <section
        aria-label="How to set up a host listing"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Getting started"
            headline="Live in under 10 minutes."
          />
          <ol
            aria-label="Steps to list your charger"
            className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
          >
            {SETUP_STEPS.map(({ step, title, description }) => (
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

      {/* ── HOST FEATURES ────────────────────────────────────────── */}
      <section
        aria-label="Host features"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="What you get"
            headline="Full control. Zero complexity."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {HOST_FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOST GUARANTEES ──────────────────────────────────────── */}
      <section
        aria-label="Host protection guarantees"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <SectionHeader
                align="left"
                eyebrow="Your property is protected"
                headline="List with confidence."
                subtext="We've built in every protection a careful homeowner would want before opening their property to strangers."
              />
              <ul role="list" className="flex flex-col gap-3">
                {HOST_GUARANTEES.map((g) => (
                  <li key={g} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                    <span className="text-sm text-[hsl(var(--foreground))]">{g}</span>
                  </li>
                ))}
              </ul>
              <Link href="/safety" className="self-start text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
                Read the full Host Protection policy →
              </Link>
            </div>
            <figure className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
              <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={0} />
                ))}
              </div>
              <blockquote>
                <p className="text-base leading-relaxed text-[hsl(var(--foreground))]">
                  &ldquo;I was nervous about strangers using my driveway at first. But the driver
                  verification and booking system means I know exactly who is coming and when. In
                  6 months, not a single problem.&rdquo;
                </p>
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-sm font-semibold text-[hsl(var(--foreground))]" aria-hidden="true">
                  AC
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Andy C.</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Homeowner host · Chiswick, London</p>
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── COMPATIBLE CHARGERS ──────────────────────────────────── */}
      <section
        aria-label="Compatible charger brands"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Works with your charger
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {['EO Charging', 'Rolec EV', 'Andersen EV', 'Ohme', 'Zappi (myenergi)', 'Wallbox'].map((brand) => (
                <span
                  key={brand}
                  className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))]"
                >
                  {brand}
                </span>
              ))}
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              + any OCPP 1.6J compatible charger · Non-smart charger support available
            </p>
          </div>
        </div>
      </section>

      {/* ── PRICING CLARITY ──────────────────────────────────────── */}
      <section aria-label="Host pricing" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Clock className="h-8 w-8 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
              Free to list. We only earn when you do.
            </h2>
            <p className="max-w-md text-base text-[hsl(var(--muted-foreground))]">
              No monthly fees, no setup costs. Zipgrid takes a 15% platform commission on each
              completed session. If your charger earns nothing, you pay nothing.
            </p>
            <Link href="/pricing" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
              See full pricing breakdown →
            </Link>
          </div>
        </div>
      </section>

      <CtaBanner
        headline="Start earning from your charger today."
        subtext="List your charger in under 10 minutes. Free to start — no monthly fee."
        primaryLabel="List my charger"
        primaryHref="/register?role=host"
        secondaryLabel="Read about safety"
        secondaryHref="/safety"
      />
    </>
  )
}
