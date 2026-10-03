/**
 * @file page.tsx
 * @description Zipgrid Home page — the primary marketing landing page.
 * Answers in under 3 seconds: What is this? Who is it for? What do I do next?
 *
 * Sections:
 *   1. Hero — headline, subline, primary CTA, secondary link, stats
 *   2. Audience split — Driver / Homeowner / Business
 *   3. How it works — 3-step driver flow
 *   4. Features — 6 platform capabilities
 *   5. Social proof — earnings, sessions, ratings
 *   6. CTA — host-focused
 *   7. CTA — driver-focused
 *
 * @module apps/web/app/(marketing)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Zap,
  MapPin,
  Brain,
  Mic,
  Shield,
  PoundSterling,
  CalendarCheck,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { StatBadge } from '@/components/marketing/StatBadge'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Zipgrid — Your AI charging concierge',
  description:
    "Tell Zipgrid where you're going and its AI concierge finds a charger you can trust, books it and pays. Homeowners, businesses and buildings earn from the chargers they already have.",
  alternates: { canonical: 'https://zipgrid.co.uk' },
}

// Every line here must describe something the platform does today.
const FEATURES = [
  {
    icon: Brain,
    title: 'An AI concierge that books for you',
    description:
      'Say where you need to charge. It finds a charger you can trust, checks the price and books it once you say yes.',
  },
  {
    icon: CalendarCheck,
    title: 'Trips planned and booked ahead',
    description:
      '"I\'m driving to Manchester tomorrow." Get your charging stops, with a backup for each, booked before you set off.',
  },
  {
    icon: Mic,
    title: 'Hands-free by voice',
    description:
      'Speak to the concierge and hear the answer back. Useful when you\'re driving or have your hands full.',
  },
  {
    icon: MapPin,
    title: 'Private chargers near you',
    description:
      'Book home, business and building chargers by location, plug type and price. Your slot is reserved before you leave.',
  },
  {
    icon: PoundSterling,
    title: 'Earn from your charger',
    description:
      'Set your hours and your price. Keep 85–92% of every booking, paid weekly. A revenue advisor tells you how to earn more.',
  },
  {
    icon: Shield,
    title: 'Verified and secured',
    description:
      'Every driver and host verifies their ID, payment is secured before each session, and reviews go both ways.',
  },
] as const

const HOW_IT_WORKS_DRIVER = [
  {
    step: '01',
    title: 'Say where you\'re going',
    description: 'Ask the concierge, or search the map by plug type and price.',
  },
  {
    step: '02',
    title: 'Confirm the booking',
    description: 'Instant book or send a request. Get your arrival code before you arrive.',
  },
  {
    step: '03',
    title: 'Charge and go',
    description: 'Plug in with your session PIN. You pay for what you use, automatically.',
  },
] as const

const AUDIENCE_CARDS = [
  {
    href: '/for-drivers',
    label: 'For Drivers',
    headline: 'Charging that\'s booked, not hoped for.',
    body: 'Reserve a private charger near you, or let the concierge plan and book your whole trip.',
    cta: 'Find charging →',
    accent: true,
  },
  {
    href: '/for-homeowners',
    label: 'For Homeowners',
    headline: 'Your charger can earn while you sleep.',
    body: 'List your home charger, set your hours and price, and get paid weekly.',
    cta: 'Start earning →',
    accent: false,
  },
  {
    href: '/for-businesses',
    label: 'For Businesses',
    headline: 'Turn parking bays into a revenue stream.',
    body: 'Manage several chargers, separate access for residents, staff and the public, and see what each one earns.',
    cta: 'See the platform →',
    accent: false,
  },
] as const

// Launch facts (no usage figures until there is real data to show).
const STATS = [
  { value: '85–92%', label: 'Of each booking goes to the host' },
  { value: 'Free', label: 'Cancellation before charging' },
  { value: 'Weekly', label: 'Payouts to hosts' },
  { value: '1 sentence', label: 'To book with the concierge' },
] as const

const TRUST_POINTS = [
  'Verified ID on every driver and host',
  'Payment secured before every session',
  'Chargers safety-scored every day',
  'Platform data hosted in the EU',
  'AI concierge, any time of day',
  'Host plans: cancel any time',
] as const

/**
 * Home page — primary marketing landing page.
 */
export default function HomePage() {
  return (
    <>
      {/* ── 1. HERO ─────────────────────────────────────────────── */}
      <section
        aria-label="Hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
          <div className="flex flex-col items-center gap-8 text-center">
            {/* Eyebrow */}
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]"
                aria-hidden="true"
              />
              Now in the UK
            </span>

            {/* Headline */}
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl lg:text-7xl">
              Tell us where you&apos;re going.{' '}
              <span className="text-[hsl(var(--primary))]">We&apos;ll handle the charging.</span>
            </h1>

            {/* Subheadline */}
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-xl">
              Say it or type it. Zipgrid&apos;s AI concierge reads the reviews, picks a charger you can trust,
              books it and pays. Have a charger? Earn from it, whether you&apos;re a homeowner, a business or a building.
            </p>

            {/* CTAs */}
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className={cn(
                  'flex min-h-[48px] items-center rounded-[6px] bg-[hsl(var(--primary))] px-7 py-3',
                  'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))]',
                  'focus-visible:outline-offset-2',
                )}
              >
                Get started free
              </Link>
              <Link
                href="#how-it-works"
                className={cn(
                  'flex min-h-[48px] items-center gap-2 rounded-[6px] px-7 py-3',
                  'text-base font-medium text-[hsl(var(--muted-foreground))] transition-colors',
                  'hover:text-[hsl(var(--foreground))]',
                )}
              >
                See how it works
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {/* Quick trust line */}
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              No credit card required · Cancel any time · UK GDPR compliant
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. STATS BAR ────────────────────────────────────────── */}
      <section
        aria-label="Platform statistics"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <StatBadge value={value} label={label} />
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 3. AUDIENCE SPLIT ───────────────────────────────────── */}
      <section
        aria-label="Who Zipgrid is for"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Built for everyone"
            headline="Who is Zipgrid for?"
            subtext="One platform, three ways to use it — driver, homeowner, or business."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCE_CARDS.map(({ href, label, headline, body, cta, accent }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex flex-col gap-5 rounded-[6px] border p-8 transition-colors',
                  accent
                    ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.04)] hover:border-[hsl(var(--primary))]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.3)]',
                )}
                aria-label={`${label} — ${headline}`}
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
                  {label}
                </span>
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
                    {headline}
                  </h2>
                  <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    {body}
                  </p>
                </div>
                <span className="mt-auto text-sm font-medium text-[hsl(var(--primary))] transition-opacity group-hover:opacity-80">
                  {cta}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS (DRIVER) ────────────────────────────── */}
      <section
        id="how-it-works"
        aria-label="How Zipgrid works for drivers"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="For drivers"
            headline="Charging in three steps."
            subtext="From finding a charger to plugging in — the whole thing takes under two minutes."
          />

          <ol
            aria-label="How to find and book a charger"
            className="mt-12 grid gap-8 sm:grid-cols-3"
          >
            {HOW_IT_WORKS_DRIVER.map(({ step, title, description }) => (
              <li key={step} className="flex flex-col gap-4">
                <span
                  className="font-mono text-4xl font-bold text-[hsl(var(--primary)/0.25)]"
                  aria-hidden="true"
                >
                  {step}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h3>
                  <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 flex justify-center">
            <Link
              href="/for-drivers"
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
                'bg-[hsl(var(--card))] px-6 py-2.5 text-sm font-medium text-[hsl(var(--foreground))]',
                'transition-colors hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--background))]',
              )}
            >
              Learn more about finding charging
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 5. PLATFORM FEATURES ────────────────────────────────── */}
      <section
        aria-label="Zipgrid platform features"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="The platform"
            headline="Everything in one place."
            subtext="Private chargers, an AI concierge, trip planning and a host revenue advisor in one place."
          />

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. HOST EARNINGS CTA ────────────────────────────────── */}
      <CtaBanner
        headline="Your charger is sitting idle right now."
        subtext="List it in minutes, set your hours and price, and keep 85–92% of every booking, paid weekly."
        primaryLabel="List your charger"
        primaryHref="/register?role=host"
        secondaryLabel="How hosting works"
        secondaryHref="/for-homeowners"
      />

      {/* ── 7. SOCIAL PROOF / TRUST ─────────────────────────────── */}
      <section
        aria-label="Trust and safety"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <SectionHeader
                align="left"
                eyebrow="Trust & safety"
                headline="Built on trust."
                subtext="Zipgrid handles money, property access and people's cars. Here's what's in place."
              />
              <ul
                aria-label="Trust and safety features"
                className="flex flex-col gap-3"
                role="list"
              >
                {TRUST_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]"
                      aria-hidden="true"
                      strokeWidth={1.5}
                    />
                    <span className="text-sm text-[hsl(var(--foreground))]">{point}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/safety"
                className="self-start text-sm font-medium text-[hsl(var(--primary))] hover:opacity-80"
              >
                Read about our safety model →
              </Link>
            </div>

            {/* Example conversation (illustrative) */}
            <figure
              className={cn(
                'rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
                'flex flex-col gap-3 p-6',
              )}
            >
              <figcaption className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Example: booking with the concierge
              </figcaption>
              {[
                { who: 'You', text: 'Get me charged near Leeds station tomorrow at 9.' },
                { who: 'Concierge', text: 'The best option is a 22 kW charger 0.4 km away, rated 4.8 with no host cancellations. 9–11am is about £6.40 from your wallet. Shall I book it?' },
                { who: 'You', text: 'Yes please.' },
                { who: 'Concierge', text: 'Booked. Your arrival code is in Bookings, and the host says to use the side gate.' },
              ].map((m, i) => (
                <p
                  key={i}
                  className={cn(
                    'max-w-[90%] rounded-2xl px-3.5 py-2 text-sm',
                    m.who === 'You'
                      ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'self-start bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]',
                  )}
                >
                  {m.text}
                </p>
              ))}
            </figure>
          </div>
        </div>
      </section>

      {/* ── 8. AI FEATURE HIGHLIGHT ─────────────────────────────── */}
      <section
        aria-label="AI and voice features"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Voice commands showcase */}
            <div
              className={cn(
                'rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
                'flex flex-col gap-3 p-6',
              )}
              aria-label="Voice command examples"
            >
              <div className="flex items-center gap-2 pb-2">
                <Mic className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Voice commands
                </span>
              </div>
              {[
                '"Get me charged near here in the next hour"',
                '"I\'m driving to Manchester tomorrow, book my stops"',
                '"Cancel my booking on Friday"',
                '"How are my chargers doing this month?"',
                '"How do card holds work?"',
              ].map((cmd) => (
                <div
                  key={cmd}
                  className={cn(
                    'rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]',
                    'px-4 py-2.5',
                  )}
                >
                  <p className="text-sm text-[hsl(var(--foreground))]">{cmd}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-6">
              <SectionHeader
                align="left"
                eyebrow="AI + Voice"
                headline="Just say what you need."
                subtext="Talk to the concierge in your own words; there are no commands to learn. Hands-free in the car or walking to your charger."
              />
              <div className="flex flex-col gap-3">
                {[
                  { icon: Zap, text: 'Plans and books whole trips, with a backup for every stop' },
                  { icon: Brain, text: 'Books, cancels or changes only after you say yes' },
                  { icon: Mic, text: 'Uses your browser\'s speech recognition, no extra hardware' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3">
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]"
                      aria-hidden="true"
                      strokeWidth={1.5}
                    />
                    <span className="text-sm text-[hsl(var(--foreground))]">{text}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/register"
                className={cn(
                  'flex min-h-[44px] w-fit items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
                  'px-5 py-2.5 text-sm font-medium text-[hsl(var(--foreground))]',
                  'transition-colors hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--background))]',
                )}
              >
                Try it free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. FINAL DRIVER CTA ─────────────────────────────────── */}
      <CtaBanner
        headline="Ready to charge smarter?"
        subtext="Free to sign up. Search and book with no subscription."
        primaryLabel="Find charging near me"
        primaryHref="/register"
        secondaryLabel="Learn how it works"
        secondaryHref="/for-drivers"
      />

      {/* ── 10. MARKETPLACE TEASER ──────────────────────────────── */}
      <section
        aria-label="Hardware marketplace and installer services"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Marketplace"
            headline="Hardware, installers, and more."
            subtext="Buy chargers and accessories, and find installers, in one place."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Zap,
                title: 'Smart chargers',
                description:
                  'Compare home chargers and accessories from marketplace sellers, with specs and prices.',
              },
              {
                icon: TrendingUp,
                title: 'Certified installers',
                description:
                  'Find installers near you, request quotes and read reviews from other customers.',
              },
              {
                icon: CheckCircle2,
                title: 'Installers checked',
                description:
                  'Installers are checked by Zipgrid before they appear, with OZEV and NICEIC status shown on each profile.',
              },
            ].map((item) => (
              <FeatureCard
                key={item.title}
                icon={item.icon}
                title={item.title}
                description={item.description}
              />
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/for-installers"
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
                'px-6 py-2.5 text-sm font-medium text-[hsl(var(--foreground))]',
                'transition-colors hover:border-[hsl(var(--primary)/0.3)]',
              )}
            >
              Explore the marketplace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
