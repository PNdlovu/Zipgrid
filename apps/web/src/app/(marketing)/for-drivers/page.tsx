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
  MapPin, Zap, CalendarCheck, Mic, CreditCard, ArrowRight, CheckCircle2, Navigation, BatteryCharging, Clock,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'For Drivers — Find & Book EV Charging Near You',
  description:
    'Book private home and business EV chargers near you, or let the AI concierge plan and book your charging. No subscription, no booking fee.',
  alternates: { canonical: 'https://zipgrid.co.uk/for-drivers' },
}

const DRIVER_FEATURES = [
  {
    icon: Mic,
    title: 'AI concierge',
    description:
      'Say or type what you need: "get me charged near Leeds tomorrow at 9". It checks the reviews, quotes the price and books once you say yes.',
  },
  {
    icon: Navigation,
    title: 'Trips booked ahead',
    description:
      'Tell it where you\'re driving. You get charging stops that fit your car and are free when you arrive, each with a backup, booked before you set off.',
  },
  {
    icon: MapPin,
    title: 'Map search',
    description:
      'Search listings on the map and filter by plug type, power and price. Each one shows its rating, reviews and safety score.',
  },
  {
    icon: CalendarCheck,
    title: 'Your slot, reserved',
    description:
      'Book a time and the charger is yours for that slot. You get an arrival code and session PIN for the booking.',
  },
  {
    icon: CreditCard,
    title: 'Wallet or card',
    description:
      'Pay from your Zipgrid wallet or a saved card. A hold is placed before the session and you\'re charged for what you use.',
  },
  {
    icon: BatteryCharging,
    title: 'Emergency charging',
    description:
      'Running low? Enter your battery level and see chargers you can still reach, ready to book.',
  },
] as const

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Ask or search',
    description:
      'Tell the concierge where and when, or search the map by plug type, power and price.',
  },
  {
    step: '02',
    title: 'Book your slot',
    description:
      'Check the price, choose your car and confirm. You get an arrival code for the booking.',
  },
  {
    step: '03',
    title: 'Arrive and plug in',
    description:
      'Follow the host\'s access instructions and start your session with your PIN.',
  },
  {
    step: '04',
    title: 'Pay for what you use',
    description:
      'When the session ends you\'re charged for what you used and the rest of the hold is released.',
  },
] as const

const DRIVER_BENEFITS = [
  'No subscription and no booking fee',
  'See the full price before you book',
  'Reserve your slot, so the charger is free when you arrive',
  'Free cancellation before charging starts',
  'Every host has verified their ID',
  'The AI concierge plans and books multi-stop trips',
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
              Charging that&apos;s booked,{' '}
              <span className="text-[hsl(var(--primary))]">not hoped for.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              Book private home and business chargers near you, or tell the concierge where you&apos;re
              going and it books your charging. Your slot is reserved before you set off.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/register"
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

      {/* ── PRICING PROMISE ──────────────────────────────────────── */}
      <section
        aria-label="How pricing works for drivers"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Why Zipgrid"
            headline="Know the price before you go."
            subtext="Hosts set their own prices. You see the full price for your slot before you book, and pay only for what you use."
          />
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { title: 'No booking fee', desc: 'You pay the host\'s price and nothing on top.' },
              { title: 'Hold, then charge', desc: 'A hold covers your booking; you\'re charged for what you use and the rest is released.' },
              { title: 'Free to cancel', desc: 'Cancel any time before charging starts and the hold is released in full.' },
            ].map(({ title, desc }) => (
              <div key={title} className="flex flex-col gap-2 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
                <p className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{desc}</p>
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
            headline="From asking to charging."
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

            {/* Example (illustrative) */}
            <figure className="flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
              <figcaption className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Example: planning a trip
              </figcaption>
              {[
                { who: 'You', text: "I'm driving from London to Manchester on Friday at 8, about 70% battery." },
                { who: 'Concierge', text: 'You need one stop. Best: a 50 kW charger near Stoke at 10:20, rated 4.9, about £9. Backup: 22 kW 3 km away. Book it?' },
                { who: 'You', text: 'Yes, book it.' },
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
                Running low? Enter your battery level and Emergency mode shows the chargers you can
                still reach, ready to book. No panic. Just a plan.
              </p>
            </div>
            <Link
              href="/register"
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
        subtext="Free to sign up. No subscription and no booking fee. Pay only for what you use."
        primaryLabel="Create your free account"
        primaryHref="/register"
        secondaryLabel="View pricing"
        secondaryHref="/pricing"
      />
    </>
  )
}
