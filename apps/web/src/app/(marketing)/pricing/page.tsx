/**
 * @file page.tsx
 * @description Pricing page — /pricing
 * Full tier comparison: Driver (free), Host (free + 15% commission),
 * Business Pro, Business Enterprise. Competitor comparison table.
 * Transparent — no hidden fees, no gotchas.
 *
 * @module apps/web/app/(marketing)/pricing
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, XCircle, Minus } from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Pricing — Transparent EV Charging Platform Pricing',
  description:
    'Free to sign up as a driver. Free to list as a homeowner — 15% commission on earnings only. Business Pro and Enterprise plans for commercial operators.',
  alternates: { canonical: 'https://zipgrid.co.uk/pricing' },
}

type PlanFeature = {
  label: string
  driver: boolean | string | null
  host: boolean | string | null
  pro: boolean | string | null
  enterprise: boolean | string | null
}

const PLAN_FEATURES: PlanFeature[] = [
  { label: 'Search & browse listings', driver: true, host: true, pro: true, enterprise: true },
  { label: 'Book chargers', driver: true, host: true, pro: true, enterprise: true },
  { label: 'Live session monitoring', driver: true, host: true, pro: true, enterprise: true },
  { label: 'Voice commands', driver: true, host: true, pro: true, enterprise: true },
  { label: 'Zipgrid Wallet', driver: true, host: true, pro: true, enterprise: true },
  { label: 'Rewards points', driver: true, host: true, pro: true, enterprise: true },
  { label: 'List charger(s)', driver: false, host: '1 charger', pro: 'Unlimited', enterprise: 'Unlimited' },
  { label: 'Platform commission', driver: null, host: '15% per session', pro: '12% per session', enterprise: '10% per session' },
  { label: 'Monthly subscription', driver: 'Free', host: 'Free', pro: '£29/month', enterprise: 'Custom' },
  { label: 'Analytics dashboard', driver: false, host: 'Basic', pro: 'Advanced', enterprise: 'Enterprise' },
  { label: 'Dynamic pricing AI', driver: false, host: false, pro: true, enterprise: true },
  { label: 'Access control (RFID/PIN)', driver: false, host: false, pro: true, enterprise: true },
  { label: 'Multi-charger management', driver: false, host: false, pro: true, enterprise: true },
  { label: 'Xero / QuickBooks integration', driver: false, host: false, pro: true, enterprise: true },
  { label: 'API access', driver: false, host: false, pro: false, enterprise: true },
  { label: 'Branded access page', driver: false, host: false, pro: true, enterprise: true },
  { label: 'Dedicated account manager', driver: false, host: false, pro: false, enterprise: true },
  { label: 'SLA support (4h response)', driver: false, host: false, pro: false, enterprise: true },
]

const COMPETITOR_ROWS = [
  { feature: 'Monthly fee', zipgrid: 'Free (driver + host)', zapmap: '£3.49/mo', podpoint: '£34–40/mo', bppulse: '£7.99/mo' },
  { feature: 'P2P host marketplace', zipgrid: '✓', zapmap: '✗', podpoint: '✗', bppulse: '✗' },
  { feature: 'Voice control', zipgrid: '✓ 90+ commands', zapmap: '✗', podpoint: '✗', bppulse: '✗' },
  { feature: 'AI scheduling', zipgrid: '✓ Agentic mode', zapmap: '✗', podpoint: '✗', bppulse: '✗' },
  { feature: 'Real-time monitoring', zipgrid: '✓ Live kWh', zapmap: '✗', podpoint: 'Limited', bppulse: 'Limited' },
  { feature: 'Hardware marketplace', zipgrid: '✓', zapmap: '✗', podpoint: 'Own brand only', bppulse: '✗' },
  { feature: 'Host protection insurance', zipgrid: '£1M guarantee', zapmap: '✗', podpoint: '✗', bppulse: '✗' },
  { feature: 'Booking / reservation', zipgrid: '✓', zapmap: '✗', podpoint: 'Some', bppulse: '✗' },
]

const PLANS = [
  {
    id: 'driver',
    name: 'Driver',
    audience: 'For EV drivers',
    price: 'Free',
    priceNote: 'No subscription',
    cta: 'Get started free',
    ctaHref: '/register',
    highlight: false,
    description: 'Search, book, and charge. Free to sign up, free to book.',
  },
  {
    id: 'host',
    name: 'Home Host',
    audience: 'For homeowners',
    price: 'Free',
    priceNote: '15% commission on earnings',
    cta: 'List your charger',
    ctaHref: '/register?role=host',
    highlight: false,
    description: 'List one charger, earn passively. Only pay when you earn.',
  },
  {
    id: 'pro',
    name: 'Business Pro',
    audience: 'For SMBs',
    price: '£29',
    priceNote: '/month + 12% commission',
    cta: 'Start Pro trial',
    ctaHref: '/register?role=host&type=smb&plan=pro',
    highlight: true,
    description: 'Unlimited chargers, dynamic pricing, and advanced analytics.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    audience: 'For large operators',
    price: 'Custom',
    priceNote: 'Bespoke pricing',
    cta: 'Contact sales',
    ctaHref: '/contact',
    highlight: false,
    description: 'API access, SLA support, branded experience, and a dedicated manager.',
  },
] as const

/**
 * Renders a plan feature cell value.
 */
function FeatureCell({ value }: { value: boolean | string | null }) {
  if (value === null) return <Minus className="mx-auto h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-label="Not applicable" />
  if (value === true) return <CheckCircle2 className="mx-auto h-4 w-4 text-[hsl(var(--primary))]" aria-label="Included" strokeWidth={1.5} />
  if (value === false) return <XCircle className="mx-auto h-4 w-4 text-[hsl(var(--muted-foreground)/0.5)]" aria-label="Not included" strokeWidth={1.5} />
  return <span className="text-xs text-[hsl(var(--foreground))]">{value}</span>
}

/**
 * Pricing page — full tier table and competitor comparison.
 */
export default function PricingPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="Pricing hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              Pricing
            </span>
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              Simple, transparent pricing.
            </h1>
            <p className="max-w-lg text-lg text-[hsl(var(--muted-foreground))]">
              Free for drivers. Free to list as a homeowner. Upgrade when your business needs more.
            </p>
          </div>
        </div>
      </section>

      {/* ── PLAN CARDS ───────────────────────────────────────────── */}
      <section
        aria-label="Pricing plans"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {PLANS.map(({ id, name, audience, price, priceNote, cta, ctaHref, highlight, description }) => (
              <div
                key={id}
                className={cn(
                  'flex flex-col gap-6 rounded-[6px] border p-7',
                  highlight
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--background))] shadow-none'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
                )}
              >
                {highlight && (
                  <span className="w-fit rounded-[4px] bg-[hsl(var(--primary))] px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Most popular
                  </span>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {audience}
                  </p>
                  <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{name}</h2>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
                </div>

                <div className="flex flex-col gap-0.5">
                  <p className="font-mono text-4xl font-bold text-[hsl(var(--foreground))]">
                    {price}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{priceNote}</p>
                </div>

                <Link
                  href={ctaHref}
                  className={cn(
                    'flex min-h-[44px] items-center justify-center rounded-[6px] px-4 py-2.5',
                    'text-sm font-semibold transition-opacity focus-visible:outline',
                    'focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                    highlight
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
                      : 'border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.4)]',
                  )}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE COMPARISON TABLE ─────────────────────────────── */}
      <section
        aria-label="Full feature comparison table"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Compare plans"
            headline="What's included in each plan."
          />

          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Plan feature comparison">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th scope="col" className="w-1/3 pb-4 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Feature
                  </th>
                  {['Driver', 'Home Host', 'Pro', 'Enterprise'].map((h) => (
                    <th key={h} scope="col" className="pb-4 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map(({ label, driver, host, pro, enterprise }, i) => (
                  <tr
                    key={label}
                    className={cn(
                      'border-b border-[hsl(var(--border))]',
                      i % 2 === 0 ? 'bg-transparent' : 'bg-[hsl(var(--secondary)/0.5)]',
                    )}
                  >
                    <td className="py-3 pr-4 text-left font-medium text-[hsl(var(--foreground))]">
                      {label}
                    </td>
                    <td className="py-3 text-center"><FeatureCell value={driver} /></td>
                    <td className="py-3 text-center"><FeatureCell value={host} /></td>
                    <td className="py-3 text-center"><FeatureCell value={pro} /></td>
                    <td className="py-3 text-center"><FeatureCell value={enterprise} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── COMPETITOR COMPARISON ────────────────────────────────── */}
      <section
        aria-label="Comparison with other EV charging platforms"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="How we compare"
            headline="Zap-Map got funded for a map. You get 20× more."
          />

          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Competitor comparison">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th scope="col" className="w-1/4 pb-4 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Feature
                  </th>
                  {[
                    { name: 'Zipgrid', highlight: true },
                    { name: 'Zap-Map', highlight: false },
                    { name: 'Pod Point', highlight: false },
                    { name: 'BP Pulse', highlight: false },
                  ].map(({ name, highlight }) => (
                    <th
                      key={name}
                      scope="col"
                      className={cn(
                        'pb-4 text-center text-xs font-semibold uppercase tracking-wide',
                        highlight ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]',
                      )}
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPETITOR_ROWS.map(({ feature, zipgrid, zapmap, podpoint, bppulse }, i) => (
                  <tr
                    key={feature}
                    className={cn(
                      'border-b border-[hsl(var(--border))]',
                      i % 2 === 0 ? 'bg-transparent' : 'bg-[hsl(var(--background)/0.5)]',
                    )}
                  >
                    <td className="py-3 pr-4 font-medium text-[hsl(var(--foreground))]">{feature}</td>
                    <td className="py-3 text-center text-xs font-semibold text-[hsl(var(--primary))]">{zipgrid}</td>
                    <td className="py-3 text-center text-xs text-[hsl(var(--muted-foreground))]">{zapmap}</td>
                    <td className="py-3 text-center text-xs text-[hsl(var(--muted-foreground))]">{podpoint}</td>
                    <td className="py-3 text-center text-xs text-[hsl(var(--muted-foreground))]">{bppulse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            * Competitor data based on publicly available pricing as of September 2026. Subject to change.
          </p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section
        aria-label="Pricing frequently asked questions"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="FAQ" headline="Common questions about pricing." />
          <dl className="mt-10 flex flex-col gap-8">
            {[
              {
                q: 'Is it really free for drivers?',
                a: 'Yes. Drivers pay nothing to search, book, or use the platform. You only pay the session fee set by the host, plus a small processing fee on card payments.',
              },
              {
                q: 'What does the 15% commission cover?',
                a: 'Payment processing, platform insurance (the £1M Host Protection Guarantee), fraud prevention, AI scheduling, voice support, and the platform itself. No hidden extras.',
              },
              {
                q: 'Can I upgrade or downgrade at any time?',
                a: 'Yes. No lock-in on any plan. Downgrade to Free at any time — your listings and history are retained.',
              },
              {
                q: 'Is VAT included in the prices shown?',
                a: 'All prices shown are exclusive of VAT. UK VAT (20%) applies where applicable. Detailed invoices showing VAT are available in your billing dashboard.',
              },
              {
                q: 'What\'s the difference between Pro and Enterprise?',
                a: 'Pro is a self-serve plan suitable for most businesses. Enterprise adds a dedicated account manager, SLA support, API access, and custom commission rates negotiated directly.',
              },
            ].map(({ q, a }) => (
              <div key={q}>
                <dt className="text-base font-semibold text-[hsl(var(--foreground))]">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <CtaBanner
        headline="Start free. Upgrade when you're ready."
        subtext="No credit card required to sign up. Upgrade to Pro or Enterprise any time."
        primaryLabel="Get started free"
        primaryHref="/register"
        secondaryLabel="Talk to sales"
        secondaryHref="/contact"
      />
    </>
  )
}
