/**
 * @file page.tsx
 * @description For Drivers marketing page — /for-drivers
 * Explains how drivers find, book, and use Zipgrid chargers.
 * Audience: EV drivers who need reliable, affordable charging.
 *
 * @module apps/web/app/(marketing)/for-drivers
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  MapPin,
  Zap,
  CalendarCheck,
  Shield,
  Mic,
  CreditCard,
  ArrowRight,
  CheckCircle2,
  Star,
  Navigation,
  BatteryCharging,
  Clock,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'For Drivers — Find & Book EV Charging Near You',
  description:
    'Find affordable home and business EV chargers near you. Book instantly, charge reliably, pay automatically. No subscription required.',
  alternates: { canonical: 'https://zipgrid.co.uk/for-drivers' },
}

const DRIVER_FEATURES = [
  {
    icon: MapPin,
    title: 'Map-based search',
    description:
      'Search hundreds of real listings on an interactive map. Filter by plug type, price, power rating, and real-time availability.',
  },
  {
    icon: CalendarCheck,
    title: 'Instant booking',
    description:
      'Reserve your slot before you leave. Get your 6-digit access PIN and QR code — no awkward waiting or calling ahead.',
  },
  {
    icon: BatteryCharging,
    title: 'Live session monitoring',
    description:
      'Watch your kWh counter update in real time. See your cost growing live. Get a push notification when your car is full.',
  },
  {
    icon: Mic,
    title: 'Voice commands',
    description:
      '"Book the nearest CCS charger for tomorrow at 10am." Works in your car, hands-free, with CarPlay and Android Auto.',
  },
  {
    icon: Navigation,
    title: 'Along-route search',
    description:
      'Planning a long drive? Find chargers along your route, not just nearby. Zipgrid searches your whole corridor.',
  },
  {
    icon: CreditCard,
    title: 'One-tap payment',
    description:
      'Saved card, Zipgrid wallet, or Apple/Google Pay. Payment happens automatically when your session ends — no friction.',
  },
] as const

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Search near you',
    description:
      'Open the map and search by your location. Filter by plug type (Type 2, CCS, CHAdeMO), power rating, and instant book.',
  },
  {
    step: '02',
    title: 'Book your slot',
    description:
      'Pick a time, confirm your vehicle, and pay. You get an access PIN and a confirmation pushed to your phone instantly.',
  },
  {
    step: '03',
    title: 'Arrive and plug in',
    description:
      'Enter your PIN or scan the QR code. The session starts automatically — no app fiddling with your hands full of cables.',
  },
  {
    step: '04',
    title: 'Session ends, payment clears',
    description:
      'Unplug when done. Payment captures automatically. Your receipt is in the app and your history is always searchable.',
  },
] as const

const DRIVER_BENEFITS = [
  'No subscription required to search and book',
  'Average price 40–60% cheaper than public rapid chargers',
  'Reserve your spot — no more arriving at a taken charger',
  'Works with all plug types: Type 2, CCS, CHAdeMO, NACS',
  'Emergency charging mode for low-battery situations',
  'AI concierge plans multi-stop road trips automatically',
] as const

/**
 * For Drivers page — explains the driver value proposition end-to-end.
 */
export default function ForDriversPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="For drivers hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              For Drivers
            </span>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              Guaranteed charging,{' '}
              <span className="text-[hsl(var(--primary))]">every time.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              Search and book private home chargers near you. 40–60% cheaper than public networks,
              always reserved, always available when you arrive.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/auth/register"
                className={cn(
                  'flex min-h-[48px] items-center rounded-[6px] bg-[hsl(var(--primary))] px-7 py-3',
                  'text-base font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2',
                )}
              >
                Find charging near me
              </Link>
              <Link
                href="#how-it-works"
                className="flex min-h-[48px] items-center gap-2 rounded-[6px] px-7 py-3 text-base font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                See how it works <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Free to sign up · No subscription to search and book
            </p>
          </div>
        </div>
      </section>

      {/* ── PRICE COMPARISON ─────────────────────────────────────── */}
      <section
        aria-label="Price comparison with public charging networks"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Why Zipgrid"
            headline="Stop paying £0.75/kWh at a public charger."
            subtext="Private home chargers on Zipgrid average 30–45p/kWh — the same rate a host pays at home."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'BP Pulse / Pod Point', price: '£0.68–0.85', unit: '/kWh', highlight: false, desc: 'Public rapid charger' },
              { label: 'Zipgrid host charger', price: '£0.30–0.45', unit: '/kWh', highlight: true, desc: 'Average private listing' },
              { label: 'Home overnight (Octopus Go)', price: '£0.07–0.10', unit: '/kWh', highlight: false, desc: 'If you have the tariff' },
            ].map(({ label, price, unit, highlight, desc }) => (
              <div
                key={label}
                className={cn(
                  'flex flex-col gap-2 rounded-[6px] border p-6',
                  highlight
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.04)]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
                )}
              >
                {highlight && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                    Best value
                  </span>
                )}
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{desc}</p>
                <p className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">
                  {price}
                  <span className="text-base font-normal text-[hsl(var(--muted-foreground))]">
                    {unit}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section
        id="how-it-works"
        aria-label="How Zipgrid works for drivers"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="How it works"
            headline="From search to session in two minutes."
          />
          <ol
            aria-label="Steps to find and book a charger"
            className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
          >
            {HOW_IT_WORKS.map(({ step, title, description }) => (
              <li key={step} className="flex flex-col gap-4">
                <span
                  className="font-mono text-4xl font-bold text-[hsl(var(--primary)/0.25)]"
                  aria-hidden="true"
                >
                  {step}
                </span>
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h3>
                <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section
        aria-label="Driver app features"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Features"
            headline="Everything a driver needs."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DRIVER_FEATURES.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFITS LIST ────────────────────────────────────────── */}
      <section
        aria-label="Driver benefits"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <SectionHeader
                align="left"
                eyebrow="Why drivers choose Zipgrid"
                headline="Less range anxiety. More road confidence."
                subtext="Every feature is built around the same goal: you plug in when and where you need to, without surprises."
              />
              <ul role="list" className="flex flex-col gap-3">
                {DRIVER_BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]"
                      aria-hidden="true"
                      strokeWidth={1.5}
                    />
                    <span className="text-sm text-[hsl(var(--foreground))]">{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Testimonial */}
            <figure className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
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
                  &ldquo;I live in a flat — no home charger. Zipgrid completely changed how I
                  charge. I found a host two streets away, booked it for every Tuesday evening,
                  and it costs me half what I was paying at Osprey.&rdquo;
                </p>
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-sm font-semibold text-[hsl(var(--foreground))]"
                  aria-hidden="true"
                >
                  DM
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Dev M.</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Driver · Brixton, London
                  </p>
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── EMERGENCY MODE CALLOUT ───────────────────────────────── */}
      <section
        aria-label="Emergency charging mode"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--destructive)/0.1)]">
              <Zap className="h-7 w-7 text-[hsl(var(--destructive))]" aria-hidden="true" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
                Emergency Charging Mode
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                Running low? Emergency mode filters listings by how many miles you have left,
                finds the closest available charger, and can voice-book it in one command. No
                panic. Just a plan.
              </p>
            </div>
            <Link
              href="/auth/register"
              className={cn(
                'ml-auto flex shrink-0 min-h-[44px] items-center gap-2 rounded-[6px]',
                'border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-2.5',
                'text-sm font-medium text-[hsl(var(--foreground))] transition-colors',
                'hover:border-[hsl(var(--primary)/0.4)]',
              )}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              Get started
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <CtaBanner
        headline="Ready to find charging near you?"
        subtext="Free to sign up. No subscription required to search and book. Pay only when you charge."
        primaryLabel="Create your free account"
        primaryHref="/auth/register"
        secondaryLabel="View pricing"
        secondaryHref="/pricing"
      />
    </>
  )
}
