/**
 * @file page.tsx
 * @description Safety & Insurance page — /safety
 * Covers: ID verification, secured payments, safety scoring, reviews,
 * incident reporting, and the insurance model (hosts keep their own cover).
 * Every statement here must match what the platform actually does.
 *
 * @module apps/web/app/(marketing)/safety
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'

import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Users,
  Zap,
  Lock,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Safety & Insurance — How Zipgrid Protects Hosts and Drivers',
  description:
    'ID-verified drivers and hosts, payment secured before every session, daily safety scoring and a clear incident process. How Zipgrid keeps charging safe.',
  alternates: { canonical: 'https://zipgrid.co.uk/safety' },
}

const SAFETY_PILLARS = [
  {
    icon: Users,
    title: 'Verified identities',
    description:
      'Every driver verifies their ID (Stripe Identity) before their first booking, and every host before a listing goes live.',
  },
  {
    icon: Lock,
    title: 'Payment secured upfront',
    description:
      'A card hold or wallet reservation is in place before each session. Drivers pay for what they use; unused holds are released in full.',
  },
  {
    icon: Zap,
    title: 'Safety scoring',
    description:
      'Every live charger is scored daily (0–100) on installation, RCD protection, fault history and driver complaints. Chargers below 50 are paused for review.',
  },
  {
    icon: Shield,
    title: 'Unique arrival codes',
    description:
      'Each booking gets its own arrival code and session PIN, so only the driver who booked can use the slot.',
  },
  {
    icon: CheckCircle2,
    title: 'Reviews both ways',
    description:
      'Drivers review chargers and hosts review drivers after every booking. Reviews are published together, so neither side can retaliate.',
  },
  {
    icon: AlertTriangle,
    title: 'Incident reporting',
    description:
      'Report a safety problem, damage or a dispute in the Resolution Centre. Safety reports go to the top of the review queue and are reviewed with the full booking record.',
  },
] as const

const DRIVER_PROTECTIONS = [
  'Hosts verify their ID before their charger can be booked',
  "See each charger's rating, reviews and safety score before you book",
  'The price is agreed when you book, and you only pay for what you use',
  'Cancel free of charge any time before charging starts',
  "Raise a dispute in the Resolution Centre if something isn't right",
] as const

const HOST_PROTECTIONS = [
  'Drivers verify their ID before they can book',
  'Payment is secured before the driver arrives',
  'Choose instant booking, or approve each request yourself',
  'Every booking has a record of who booked, when and the arrival code used',
  'If a driver damages your property, we recover the cost from them and pay it to you in full',
] as const

const INCIDENT_STEPS = [
  { step: '01', title: 'Stay safe', description: 'If anyone is hurt or in danger, call 999 first.' },
  { step: '02', title: 'Report it', description: 'In the Resolution Centre, choose Safety problem, Property damage, Billing or another type, and add photos and details.' },
  { step: '03', title: 'We review it', description: 'We look at the booking record, the session data and what both sides tell us.' },
  { step: '04', title: 'Resolution', description: 'We tell both sides the outcome. Refunds go back to the original payment method. If a driver caused damage, we charge them and pay the host (up to £1,000; larger losses go to the host’s insurer with the booking record).' },
] as const

/**
 * Safety & Insurance page.
 */
export default function SafetyPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="Safety page hero"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="flex flex-col items-center gap-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--primary)/0.08)]" aria-hidden="true">
              <Shield className="h-8 w-8 text-[hsl(var(--primary))]" strokeWidth={1.5} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              Safety & Insurance
            </span>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-6xl">
              Safety is not a feature.{' '}
              <span className="text-[hsl(var(--primary))]">It&apos;s the foundation.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
              Zipgrid handles money, property access, and people&apos;s vehicles. We built the safety
              model first — before any other feature. Here&apos;s exactly how we protect everyone on
              the platform.
            </p>
          </div>
        </div>
      </section>

      {/* ── INSURANCE MODEL ──────────────────────────────────────── */}
      <section
        aria-label="Insurance"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--primary)/0.04)]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.1)]" aria-hidden="true">
              <Shield className="h-6 w-6 text-[hsl(var(--primary))]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
                About insurance
              </h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Zipgrid is the booking and payment platform; it doesn&apos;t provide insurance. Hosts keep their own
                home and public liability cover that includes sharing their charger, and drivers keep their usual
                motor insurance. We give everyone verified identities and a full booking record to rely on.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SIX SAFETY PILLARS ───────────────────────────────────── */}
      <section
        aria-label="Safety pillars"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="How we keep you safe"
            headline="Six layers of protection."
            subtext="Each one is built into how booking and payment work on Zipgrid."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY_PILLARS.map((p) => (
              <FeatureCard key={p.title} icon={p.icon} title={p.title} description={p.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── TWO-COLUMN PROTECTIONS ───────────────────────────────── */}
      <section
        aria-label="Driver and host protections"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Specific protections"
            headline="Built for both sides."
          />
          <div className="mt-12 grid gap-12 lg:grid-cols-2">
            {/* Driver protections */}
            <div className="flex flex-col gap-5">
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                For Drivers
              </h3>
              <ul role="list" className="flex flex-col gap-3">
                {DRIVER_PROTECTIONS.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                    <span className="text-sm text-[hsl(var(--foreground))]">{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Host protections */}
            <div className="flex flex-col gap-5">
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                For Hosts
              </h3>
              <ul role="list" className="flex flex-col gap-3">
                {HOST_PROTECTIONS.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                    <span className="text-sm text-[hsl(var(--foreground))]">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI SAFETY SCORE ──────────────────────────────────────── */}
      <section
        aria-label="AI safety scoring system"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <SectionHeader
                align="left"
                eyebrow="AI safety score"
                headline="Every charger is rescored every day."
                subtext="Each live listing gets a Safety Score between 0 and 100, recalculated daily from what we know about the charger and how its sessions go."
              />
              <div className="flex flex-col gap-3">
                {[
                  { range: '80–100', label: 'Excellent', desc: 'No issues. Normal operations.', color: 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' },
                  { range: '50–79', label: 'Good', desc: 'Some gaps, such as missing installation details.', color: 'bg-yellow-500/10 text-yellow-600' },
                  { range: '0–49', label: 'Paused', desc: 'Listing paused for review until the issue is fixed.', color: 'bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]' },
                ].map(({ range, label, desc, color }) => (
                  <div key={range} className="flex items-center gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                    <span className={cn('rounded-[4px] px-2 py-1 font-mono text-xs font-semibold', color)}>
                      {range}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                Score inputs
              </h3>
              <ul role="list" className="flex flex-col gap-3">
                {[
                  'Charger age',
                  'RCD (residual current) protection',
                  'Installed by a qualified electrician',
                  'Fault codes reported by connected chargers',
                  'Driver complaints',
                  'Platform inspection result',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                    <span className="text-sm text-[hsl(var(--foreground))]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── INCIDENT PROCESS ─────────────────────────────────────── */}
      <section
        aria-label="Incident reporting process"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="If something goes wrong"
            headline="A clear process, not a runaround."
            subtext="Every incident follows the same four steps."
          />
          <ol
            aria-label="Incident resolution process"
            className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
          >
            {INCIDENT_STEPS.map(({ step, title, description }) => (
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

      {/* ── COMPLIANCE ───────────────────────────────────────────── */}
      <section
        aria-label="Compliance and certifications"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <FileText className="h-8 w-8 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
            <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
              Data and payments
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                'Payments by Stripe (PCI DSS Level 1)',
                'ID checks by Stripe Identity',
                'Export or delete your data any time',
              ].map((cert) => (
                <span
                  key={cert}
                  className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm text-[hsl(var(--foreground))]"
                >
                  {cert}
                </span>
              ))}
            </div>
            <p className="max-w-md text-sm text-[hsl(var(--muted-foreground))]">
              Card details never touch Zipgrid&apos;s servers. Platform data is hosted in the EU (Amsterdam).
            </p>
          </div>
        </div>
      </section>

      <CtaBanner
        headline="Safety built in from the start."
        subtext="Verified people, secured payments and a clear process if something goes wrong."
        primaryLabel="Get started"
        primaryHref="/register"
        secondaryLabel="Visit the Help Centre"
        secondaryHref="/help"
      />
    </>
  )
}
