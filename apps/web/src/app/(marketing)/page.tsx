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
  Star,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { StatBadge } from '@/components/marketing/StatBadge'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Zipgrid — EV Charging Made Easy',
  description:
    'Find affordable EV charging near you, or earn from your idle charger. AI-powered scheduling, real-time monitoring, and voice control. UK-first.',
  alternates: { canonical: 'https://zipgrid.co.uk' },
}

const FEATURES = [
  {
    icon: MapPin,
    title: 'Find charging near you',
    description:
      'Search hundreds of private and home chargers by location, plug type, and availability. Reserve your spot before you leave.',
  },
  {
    icon: PoundSterling,
    title: 'Earn from your charger',
    description:
      'Your £1,200 charger earns up to £140/month when you\'re not using it. Set your hours, set your price — we handle the rest.',
  },
  {
    icon: Brain,
    title: 'AI that does the work',
    description:
      'Smart scheduling picks the cheapest rate window. Agentic mode books maintenance, adjusts pricing, and flags faults — automatically.',
  },
  {
    icon: Mic,
    title: 'Hands-free voice control',
    description:
      '"Charge to 80% before 7am." That\'s it. Voice commands work for bookings, navigation, session control, and account management.',
  },
  {
    icon: CalendarCheck,
    title: 'Real-time session monitoring',
    description:
      'Watch your kWh counter live. Get notified when your car is full. See your cost to the penny before the session ends.',
  },
  {
    icon: Shield,
    title: '£1M host protection',
    description:
      'Every host listing is covered by our Host Protection Guarantee. Verified drivers, insured sessions, and 24/7 incident support.',
  },
] as const

const HOW_IT_WORKS_DRIVER = [
  {
    step: '01',
    title: 'Search near you',
    description: 'Open the map, filter by plug type and price. See real-time availability.',
  },
  {
    step: '02',
    title: 'Book in seconds',
    description: 'Instant book or send a request. Get your access PIN before you arrive.',
  },
  {
    step: '03',
    title: 'Charge and go',
    description: 'Plug in, watch the kWh counter, pay automatically when done.',
  },
] as const

const AUDIENCE_CARDS = [
  {
    href: '/for-drivers',
    label: 'For Drivers',
    headline: 'Guaranteed charging, every time.',
    body: 'Book private home chargers near you. Cheaper than public networks, always available.',
    cta: 'Find charging →',
    accent: true,
  },
  {
    href: '/for-homeowners',
    label: 'For Homeowners',
    headline: 'Your charger earns while you sleep.',
    body: 'List your home charger, set your hours, and earn up to £140/month with zero effort.',
    cta: 'Start earning →',
    accent: false,
  },
  {
    href: '/for-businesses',
    label: 'For Businesses',
    headline: 'Turn parking bays into a revenue stream.',
    body: 'Multi-charger dashboard, dynamic pricing, access control, and analytics for your whole fleet.',
    cta: 'See the platform →',
    accent: false,
  },
] as const

const STATS = [
  { value: '500+', label: 'Active listings' },
  { value: '20k+', label: 'Registered drivers' },
  { value: '4.8★', label: 'Average host rating' },
  { value: '£140', label: 'Avg monthly host earn' },
] as const

const TRUST_POINTS = [
  'Verified ID on every driver and host',
  'Real-time charger health monitoring',
  '£1M Host Protection Guarantee',
  'UK GDPR compliant — data stays in the EU',
  'Available 24/7 AI support',
  'No lock-in — cancel any time',
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
              EV charging,{' '}
              <span className="text-[hsl(var(--primary))]">made easy.</span>
            </h1>

            {/* Subheadline */}
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))] sm:text-xl">
              Find affordable home chargers near you, or earn from your idle charger. AI scheduling,
              voice control, and real-time monitoring — built for UK drivers.
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
            subtext="No other platform combines P2P charging, AI automation, voice control, and a hardware marketplace."
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
        subtext="The average Zipgrid host earns £140/month from a charger that cost £1,200 to install. That's an 11-month payback."
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
                headline="Built on trust, backed by cover."
                subtext="Zipgrid handles money, property access, and people's cars. We take that seriously."
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

            {/* Testimonial */}
            <figure
              className={cn(
                'rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
                'flex flex-col gap-4 p-8',
              )}
            >
              <div className="flex gap-0.5" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                    aria-hidden="true"
                    strokeWidth={0}
                  />
                ))}
              </div>
              <blockquote>
                <p className="text-base leading-relaxed text-[hsl(var(--foreground))]">
                  &ldquo;I listed my Zappi charger in 10 minutes and earned £127 in the first
                  month. The AI scheduling means it never clashes with my own overnight charging.
                  Genuinely zero effort.&rdquo;
                </p>
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-sm font-semibold text-[hsl(var(--foreground))]"
                  aria-hidden="true"
                >
                  SC
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    Sarah C.
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Homeowner host · Earlsfield, London
                  </p>
                </div>
              </figcaption>
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
                '"Charge to 80% before 7am"',
                '"Book the nearest CCS charger for tomorrow at 10am"',
                '"How much did I earn this week?"',
                '"Stop my charging session"',
                '"Find a charger along my route to Manchester"',
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
                subtext="90+ voice commands. Hands-free in the car, at your desk, or walking to your charger. No app navigation required."
              />
              <div className="flex flex-col gap-3">
                {[
                  { icon: Zap, text: 'Smart scheduling — cheapest rate, automatically' },
                  { icon: Brain, text: 'Agentic mode — AI books and manages everything' },
                  { icon: Mic, text: 'Works via Web Speech API — free, no extra hardware' },
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
        subtext="Join thousands of UK drivers already using Zipgrid. Free to sign up, no subscription required to search."
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
            subtext="Buy EV chargers, accessories, and book OZEV-certified installers — all in one platform."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Zap,
                title: 'Smart chargers',
                description:
                  'Browse EO, Rolec, Ohme, Zappi, and Andersen chargers with real specs, real prices.',
              },
              {
                icon: TrendingUp,
                title: 'Certified installers',
                description:
                  'Book OZEV-certified installers near you. Quotes, reviews, and scheduling — handled.',
              },
              {
                icon: CheckCircle2,
                title: 'Everything verified',
                description:
                  'Every product tested. Every installer OZEV-certified. No unverified listings.',
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
