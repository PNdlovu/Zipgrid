/**
 * @file page.tsx
 * @description Safety & Insurance page — /safety
 * Covers: driver verification, host protection, £1M guarantee,
 * AI safety score, incident process, and insurance model.
 *
 * @module apps/web/app/(marketing)/safety
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Users,
  Zap,
  Clock,
  Lock,
} from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Safety & Insurance — How Zipgrid Protects Hosts and Drivers',
  description:
    'Verified drivers, £1M Host Protection Guarantee, AI safety scoring, and 24/7 incident support. How Zipgrid keeps every session safe.',
  alternates: { canonical: 'https://zipgrid.co.uk/safety' },
}

const SAFETY_PILLARS = [
  {
    icon: Users,
    title: 'Verified identities',
    description:
      'Every driver completes identity verification (Stripe Identity) before their first booking. Hosts verify before their first listing goes live.',
  },
  {
    icon: Shield,
    title: '£1M Host Protection',
    description:
      'Our Host Protection Guarantee covers physical damage to your property caused during a booking, up to £1 million per incident.',
  },
  {
    icon: Zap,
    title: 'AI safety scoring',
    description:
      'Every listing gets a real-time Safety Score (0–100) based on charger health, incident history, and session patterns. Listings below 50 are auto-paused.',
  },
  {
    icon: Lock,
    title: 'Secure access',
    description:
      'Access codes are AES-256-GCM encrypted at rest and unique per booking. The driver\'s PIN expires 30 minutes after the session ends.',
  },
  {
    icon: AlertTriangle,
    title: 'Incident response',
    description:
      'Our safety team responds to P1 incidents (safety risk) within 15 minutes, 24/7. Affected sessions can be remotely terminated from the platform.',
  },
  {
    icon: Clock,
    title: '24/7 AI support',
    description:
      'AI support handles 80% of queries instantly. Safety-critical issues are automatically escalated to the human safety team regardless of time.',
  },
] as const

const DRIVER_PROTECTIONS = [
  'Identity-verified hosts only — all personal addresses obscured until booking confirmed',
  'Transparent charger health score before every booking',
  'Real-time session monitoring with automatic fault detection',
  'Booking code protects your session from interruption',
  'Insurance coverage for equipment malfunction during your session',
  'Dispute resolution with 48-hour SLA — you always have recourse',
] as const

const HOST_PROTECTIONS = [
  'Identity-verified drivers — full KYC required before first booking',
  'You approve every driver before instant booking is enabled',
  'Property damage covered up to £1M per incident',
  'No-show protection — you are paid 50% even if the driver doesn\'t arrive',
  'Cancellation protection — hosts can cancel any booking with no penalty',
  'AI monitors every session for anomalies and alerts you immediately',
] as const

const INCIDENT_STEPS = [
  { step: '01', title: 'Report immediately', description: 'Use the Report button in any active or recent session. Available in-app and via AI voice: "Report a problem."' },
  { step: '02', title: 'Remote assessment', description: 'Our safety team reviews the session data, charger telemetry, and any photos or notes you provide — within 15 minutes for P1 incidents.' },
  { step: '03', title: 'Session terminated if needed', description: 'We can remotely stop any active session, lock out the charger, and notify both parties within seconds.' },
  { step: '04', title: 'Resolution and payout', description: 'Disputes are resolved within 48 hours. Insurance claims for qualifying damage are initiated within 5 business days.' },
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

      {/* ── HOST PROTECTION GUARANTEE BANNER ────────────────────── */}
      <section
        aria-label="£1M Host Protection Guarantee"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--primary)/0.04)]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.1)]" aria-hidden="true">
              <Shield className="h-6 w-6 text-[hsl(var(--primary))]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
                £1,000,000 Host Protection Guarantee
              </h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Every completed booking on Zipgrid is covered. If a driver causes physical damage to
                your property during a session, we cover it up to £1M — no additional insurance
                policy required.
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
            subtext="Each layer is independent. Together they create a platform where every session is safe for everyone involved."
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
                headline="Every charger is monitored in real time."
                subtext="Zipgrid's AI monitors every session and assigns each listing a Safety Score between 0 and 100."
              />
              <div className="flex flex-col gap-3">
                {[
                  { range: '80–100', label: 'Excellent', desc: 'No issues. Normal operations.', color: 'bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]' },
                  { range: '50–79', label: 'Good', desc: 'Minor anomalies. Monitoring increased.', color: 'bg-yellow-500/10 text-yellow-600' },
                  { range: '0–49', label: 'Auto-paused', desc: 'Listing paused automatically. Host notified.', color: 'bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]' },
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
                  'Session energy anomaly rate (unexpected power drops)',
                  'OCPP error code frequency (fault codes from charger)',
                  'Driver complaint rate per 100 sessions',
                  'Charger uptime over last 30 days',
                  'Response time to host alerts',
                  'Maintenance log recency',
                  'Incident history (severity-weighted)',
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
            subtext="Every incident follows the same transparent four-step process with published SLAs."
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
              Compliance and certifications
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                'UK GDPR compliant',
                'PCI-DSS (via Stripe)',
                'Cyber Essentials (at launch)',
                'SOC 2 Type I (Month 12)',
                'ISO 27001 (Month 36)',
                'BS EN 61851 (charging standards)',
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
              All data is processed and stored in the EU (Amsterdam, Netherlands) — lawful under UK
              GDPR adequacy decision.
            </p>
          </div>
        </div>
      </section>

      <CtaBanner
        headline="Safety built in from the start."
        subtext="Every host and driver on Zipgrid is protected. Join a platform that takes your safety as seriously as you do."
        primaryLabel="Get started"
        primaryHref="/auth/register"
        secondaryLabel="Read the Trust & Safety Policy"
        secondaryHref="/legal/trust-safety"
      />
    </>
  )
}
