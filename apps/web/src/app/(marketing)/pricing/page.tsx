/**
 * @file page.tsx
 * @description Pricing page — /pricing
 * Drivers are free; hosts choose Starter, Growth or Pro. Plan prices,
 * commission, listing limits and features come from domains/billing/plans
 * (what billing actually charges), so this page can't drift from it.
 *
 * @module apps/web/app/(marketing)/pricing
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Minus } from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { FEATURE_LABELS, PLAN_LIST, type Plan, type PlanFeature } from '@/domains/billing/plans'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Pricing — Zipgrid',
  description:
    'Free for drivers, with no booking fee. Hosts list free on Starter (15% commission), or choose Growth or Pro for lower commission and more tools.',
  alternates: { canonical: 'https://zipgrid.co.uk/pricing' },
}

const pounds = (pence: number) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`

function priceLine(p: Plan): { price: string; note: string } {
  if (p.monthlyPence === 0) return { price: 'Free', note: `${p.commissionPct}% commission on bookings` }
  return {
    price: pounds(p.monthlyPence),
    note: `/month + ${p.commissionPct}% commission · or ${pounds(p.annualPence)}/year`,
  }
}

const listingLimit = (p: Plan) => (p.maxListings === null ? 'Unlimited' : `Up to ${p.maxListings}`)

const EVERY_HOST = [
  'AI revenue advisor',
  'Instant booking or approve each request',
  'Weekly payouts once you reach £5',
  'Residential properties: residents, access rules and revenue sharing',
]

const DRIVER_INCLUDES = [
  'AI concierge and trip planning',
  'Book with your wallet or a saved card',
  'No booking fee: you pay the host\'s price',
  'Free cancellation before charging starts',
]

const FAQ = [
  {
    q: 'Do drivers pay a fee?',
    a: 'No. You pay the price the host sets for the session, and nothing else. Card holds and unused wallet reservations are released in full.',
  },
  {
    q: 'What does the commission cover?',
    a: 'Payment processing, ID verification of drivers, the booking and payout system, the AI concierge and revenue advisor, and support through the Resolution Centre. Zipgrid does not provide insurance; hosts keep their own cover.',
  },
  {
    q: 'Can I change or cancel my plan?',
    a: 'Yes. Upgrade any time; a cancellation takes effect at the end of the period you\'ve paid for, and you move back to Starter. Your listings and history stay.',
  },
  {
    q: 'Is VAT included?',
    a: 'Plan prices are shown excluding VAT. UK VAT applies where applicable.',
  },
]

/** Pricing page. */
export default function PricingPage() {
  const features = Object.keys(FEATURE_LABELS) as PlanFeature[]
  return (
    <>
      <section aria-label="Pricing hero" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">Pricing</span>
            <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              Simple, transparent pricing.
            </h1>
            <p className="max-w-lg text-lg text-[hsl(var(--muted-foreground))]">
              Free for drivers. Free to list your charger. Lower commission when you host more.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Pricing plans" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:px-8 xl:grid-cols-4">
          <PlanCard
            audience="For EV drivers"
            name="Driver"
            price="Free"
            note="No subscription, no booking fee"
            bullets={DRIVER_INCLUDES}
            cta="Get started free"
            href="/register"
          />
          {PLAN_LIST.map((p) => {
            const { price, note } = priceLine(p)
            return (
              <PlanCard
                key={p.tier}
                audience={p.tier === 'starter' ? 'For homeowners' : 'For hosts with more chargers'}
                name={p.name}
                price={price}
                note={note}
                bullets={p.highlights}
                cta={p.monthlyPence === 0 ? 'List your charger' : `Choose ${p.name}`}
                href={`/register?role=host${p.tier === 'starter' ? '' : `&plan=${p.tier}`}`}
                highlight={p.tier === 'growth'}
              />
            )
          })}
        </div>
      </section>

      <section aria-label="Plan comparison" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Compare host plans" headline="What's included." />
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm" aria-label="Host plan comparison">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th scope="col" className="w-2/5 pb-4 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Feature</th>
                  {PLAN_LIST.map((p) => (
                    <th key={p.tier} scope="col" className="pb-4 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Monthly price" cells={PLAN_LIST.map((p) => (p.monthlyPence ? `${pounds(p.monthlyPence)}/month` : 'Free'))} />
                <Row label="Platform commission" cells={PLAN_LIST.map((p) => `${p.commissionPct}%`)} />
                <Row label="You keep" cells={PLAN_LIST.map((p) => `${100 - p.commissionPct}% of each booking`)} />
                <Row label="Charger listings" cells={PLAN_LIST.map(listingLimit)} />
                {EVERY_HOST.map((label) => <Row key={label} label={label} cells={PLAN_LIST.map(() => true)} />)}
                {features.map((f) => (
                  <Row key={f} label={FEATURE_LABELS[f]} cells={PLAN_LIST.map((p) => p.features.includes(f))} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-label="Pricing questions" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="FAQ" headline="Common questions about pricing." />
          <dl className="mt-10 flex flex-col gap-8">
            {FAQ.map(({ q, a }) => (
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
        subtext="No card needed to sign up."
        primaryLabel="Get started free"
        primaryHref="/register"
        secondaryLabel="Questions? Visit the Help Centre"
        secondaryHref="/help"
      />
    </>
  )
}

function PlanCard({ audience, name, price, note, bullets, cta, href, highlight }: {
  audience: string
  name: string
  price: string
  note: string
  bullets: string[]
  cta: string
  href: string
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'flex flex-col gap-5 rounded-[6px] border p-7',
      highlight ? 'border-[hsl(var(--primary))] bg-[hsl(var(--background))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
    )}>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{audience}</p>
        <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{name}</h2>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-4xl font-bold text-[hsl(var(--foreground))]">{price}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{note}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-[hsl(var(--foreground))]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            {b}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={cn(
          'flex min-h-[44px] items-center justify-center rounded-[6px] px-4 py-2.5 text-sm font-semibold transition-opacity',
          highlight
            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            : 'border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.4)]',
        )}
      >
        {cta}
      </Link>
    </div>
  )
}

function Row({ label, cells }: { label: string; cells: (string | boolean)[] }) {
  return (
    <tr className="border-b border-[hsl(var(--border))]">
      <td className="py-3 pr-4 text-left font-medium text-[hsl(var(--foreground))]">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className="py-3 text-center">
          {c === true ? <CheckCircle2 className="mx-auto h-4 w-4 text-[hsl(var(--primary))]" aria-label="Included" strokeWidth={1.5} />
            : c === false ? <Minus className="mx-auto h-4 w-4 text-[hsl(var(--muted-foreground)/0.5)]" aria-label="Not included" />
              : <span className="text-xs text-[hsl(var(--foreground))]">{c}</span>}
        </td>
      ))}
    </tr>
  )
}
