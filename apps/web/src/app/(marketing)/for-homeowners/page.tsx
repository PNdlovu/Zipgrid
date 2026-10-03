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
  Clock,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'For Homeowners — Earn From Your Home EV Charger',
  description:
    'Share your home EV charger on Zipgrid. Set your hours and price, keep 85–92% of every booking, and get paid weekly.',
  alternates: { canonical: 'https://zipgrid.co.uk/for-homeowners' },
}

const HOST_FEATURES = [
  {
    icon: CalendarDays,
    title: 'Set your own hours',
    description:
      'Open your charger only when it suits you, and block out the times you need it yourself.',
  },
  {
    icon: PoundSterling,
    title: 'You set the price',
    description:
      'Charge by the hour or per session, or by the kWh with a connected charger. Change it whenever you like.',
  },
  {
    icon: Brain,
    title: 'AI revenue advisor',
    description:
      'See how your charger is doing against others nearby, and get specific suggestions. Price changes only happen when you say yes.',
  },
  {
    icon: Zap,
    title: 'Instant or approve',
    description:
      'Let drivers book instantly, or approve each request yourself. Either way, payment is secured before they arrive.',
  },
  {
    icon: Shield,
    title: 'Verified drivers',
    description:
      'Every driver verifies their ID before they can book, and every booking records who came and when.',
  },
  {
    icon: Settings,
    title: 'Quick setup',
    description:
      'Add your charger\'s details, drop a map pin, set your hours and price, and verify your ID.',
  },
] as const

const SETUP_STEPS = [
  { step: '01', title: 'Add your charger', description: 'Tell us about your charger and where it is. Connected (OCPP) chargers can be paired too.' },
  { step: '02', title: 'Set your listing', description: 'Add photos, access instructions, your hours and your price.' },
  { step: '03', title: 'Verify and go live', description: 'Verify your ID and publish. Drivers can book instantly, or you approve each request.' },
  { step: '04', title: 'Get paid weekly', description: 'Earnings are paid to your bank every week once they reach £5.' },
] as const

// A worked example from stated assumptions, not a promise.
const EXAMPLE = { kw: 7, hours: 2, pricePence: 45, costPence: 25, keepPct: 85 }
const SESSION_KWH = EXAMPLE.kw * EXAMPLE.hours
const RECEIVE_PER_SESSION = (SESSION_KWH * EXAMPLE.pricePence * EXAMPLE.keepPct) / 100 / 100
const COST_PER_SESSION = (SESSION_KWH * EXAMPLE.costPence) / 100
const WEEKS_PER_MONTH = 52 / 12
const EARNINGS_EXAMPLES = [2, 5, 10].map((perWeek) => {
  const sessions = perWeek * WEEKS_PER_MONTH
  return {
    scenario: `${perWeek} bookings a week`,
    receive: Math.round(sessions * RECEIVE_PER_SESSION),
    cost: Math.round(sessions * COST_PER_SESSION),
  }
})

const HOST_GUARANTEES = [
  'Every driver verifies their ID before their first booking',
  'Payment is secured before the driver arrives',
  'Choose instant booking or approve each request',
  'Cancel a booking if you need to',
  'A record of every booking: who, when and the arrival code used',
  'Report damage or a safety problem in the Resolution Centre',
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
              Your charger can earn{' '}
              <span className="text-[hsl(var(--primary))]">while you sleep.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              Share your home charger with nearby drivers when you&apos;re not using it. Set your hours
              and price, keep 85–92% of every booking, and get paid weekly.
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
                See an earnings example <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Free to list · No monthly fee on Starter · 15% commission only when you earn
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
            headline="A worked example."
            subtext="What you earn depends on your price, how often drivers book and what your electricity costs. Here's the arithmetic for one example."
          />
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Earnings by availability scenario">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {['If you get', 'You receive / month', 'Your electricity / month', 'Profit / month'].map((h) => (
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
                {EARNINGS_EXAMPLES.map(({ scenario, receive, cost }) => (
                  <tr key={scenario} className="border-b border-[hsl(var(--border))]">
                    <td className="py-4 pr-8 font-medium text-[hsl(var(--foreground))]">{scenario}</td>
                    <td className="py-4 pr-8 font-mono text-[hsl(var(--foreground))]">£{receive}</td>
                    <td className="py-4 pr-8 font-mono text-[hsl(var(--muted-foreground))]">£{cost}</td>
                    <td className="py-4 font-mono font-semibold text-[hsl(var(--foreground))]">£{receive - cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            Example only, not a forecast: a {EXAMPLE.kw} kW charger, {EXAMPLE.hours}-hour bookings ({SESSION_KWH} kWh), you charge {EXAMPLE.pricePence}p/kWh,
            your electricity costs {EXAMPLE.costPence}p/kWh, Starter plan (you keep {EXAMPLE.keepPct}%). A cheaper off-peak tariff or a higher price increases your profit.
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
            headline="How to get started."
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
                subtext="What's in place before a driver comes to your home."
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
                How safety works on Zipgrid →
              </Link>
            </div>
            <div className="flex flex-col gap-3 rounded-[6px] border border-amber-500/30 bg-amber-500/10 p-8">
              <p className="text-base font-semibold text-[hsl(var(--foreground))]">Before you list: check your insurance</p>
              <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]">
                Zipgrid doesn&apos;t provide insurance. Tell your home insurer that you share your charger and check
                you have public liability cover for people using it. Hosts get a ready-to-send letter in
                Settings → Insurance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CHARGERS ─────────────────────────────────────────────── */}
      <section
        aria-label="Which chargers can be listed"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Works with your charger
            </p>
            <p className="max-w-xl text-sm text-[hsl(var(--foreground))]">
              Any safely installed home charger can be listed and priced by the hour or per session.
              Chargers that support OCPP 1.6J can be connected to price by the kWh.
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
              No setup costs. On Starter there&apos;s no monthly fee: Zipgrid takes 15% of each completed
              booking. Growth and Pro plans lower the commission to 12% or 8%.
            </p>
            <Link href="/pricing" className="text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80">
              See full pricing breakdown →
            </Link>
          </div>
        </div>
      </section>

      <CtaBanner
        headline="Start earning from your charger today."
        subtext="Free to list on Starter, with no monthly fee. You only pay commission when you earn."
        primaryLabel="List my charger"
        primaryHref="/register?role=host"
        secondaryLabel="Read about safety"
        secondaryHref="/safety"
      />
    </>
  )
}
