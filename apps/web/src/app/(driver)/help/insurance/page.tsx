/**
 * @file page.tsx
 * @description /driver/help/insurance — Driver-facing Insurance Hub.
 * Plain-English summary of what drivers are covered for on Zipgrid,
 * how to file a claim, and a tracker for active claims.
 *
 * @module apps/web/app/(driver)/help/insurance
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import Link from 'next/link'
import {
  ArrowLeft, ShieldCheck, ShieldX, FileText, ChevronRight,
  CheckCircle2, Clock, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Coverage items ─────────────────────────────────────────── */

const COVERED: Array<{ title: string; detail: string }> = [
  {
    title: 'Charger fault during your session',
    detail:
      'If the charger fails mid-session and you are charged for energy you didn\'t receive, Zipgrid will refund the difference. Raise a case in the Resolution Centre within 7 days.',
  },
  {
    title: 'Host cancellation after confirmation',
    detail:
      'If a host cancels your confirmed booking within 24 hours of your start time, you\'ll receive a full refund including the convenience fee. Zipgrid may also provide a £5 goodwill credit.',
  },
  {
    title: 'Billing error',
    detail:
      'If you are charged an incorrect amount (e.g. idle fee applied incorrectly, wrong pricing model), Zipgrid will investigate and issue a corrected refund.',
  },
  {
    title: 'Inaccessible charger on arrival',
    detail:
      'If the charger is inaccessible due to the host\'s failure (gate code wrong, charger unavailable) and you cannot charge, you\'ll receive a full refund.',
  },
]

const NOT_COVERED: Array<{ title: string; detail: string }> = [
  {
    title: 'Vehicle damage',
    detail:
      'Damage to your vehicle during a session is not covered by Zipgrid\'s platform coverage. Your own vehicle insurance (comprehensive) should cover damage to your EV.',
  },
  {
    title: 'Deliberate misuse of the charger',
    detail:
      'Damage caused by deliberate or negligent misuse of the host\'s equipment is not covered and may result in you being liable for repair costs.',
  },
  {
    title: 'Power outage or grid failure',
    detail:
      'Zipgrid cannot guarantee uninterrupted charging if the local electricity supply fails. Hosts are not liable for events outside their control.',
  },
  {
    title: 'Trip planning inaccuracies',
    detail:
      'Range estimates are provided for guidance only. Zipgrid is not liable if real-world range differs from the estimate due to driving style, weather, or vehicle condition.',
  },
]

const CLAIM_STEPS = [
  {
    step: 1,
    label: 'Report the problem',
    detail: 'Go to the Resolution Centre and raise a dispute. Select the category that best describes what happened.',
  },
  {
    step: 2,
    label: 'Upload evidence',
    detail: 'Attach photos, video, or screenshots that support your case (e.g. a screenshot of the session stopping unexpectedly).',
  },
  {
    step: 3,
    label: 'Zipgrid investigates',
    detail: 'Our Trust & Safety team reviews both sides within 5 business days. They may request additional information.',
  },
  {
    step: 4,
    label: 'Decision and resolution',
    detail: 'Once a decision is made, you\'ll receive an email with the outcome and any refund details. Refunds appear within 5–10 business days.',
  },
]

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'How long do I have to raise a dispute?',
    a: 'You must raise a dispute within 30 days of the session end date. After 30 days, Zipgrid\'s ability to investigate may be limited.',
  },
  {
    q: 'What if the host disputes my claim?',
    a: 'Zipgrid acts as an impartial mediator. Both sides can submit evidence and a member of our Trust & Safety team will make a final decision.',
  },
  {
    q: 'Will I lose my account if I raise a dispute?',
    a: 'Raising a genuine dispute never affects your account. Zipgrid only takes action if evidence shows that a claim was fabricated.',
  },
  {
    q: 'How does Zipgrid cover hosts?',
    a: 'Hosts are covered by the Zipgrid Host Protection Guarantee — up to £1M of commercial general liability. This covers third-party claims arising from a session. See your host settings for full details.',
  },
]

/* ── Accordion item ─────────────────────────────────────────── */

/** Expandable FAQ accordion row. */
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-medium text-[hsl(var(--foreground))]">
        {q}
        <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <p className="border-t border-[hsl(var(--border))] px-4 py-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{a}</p>
    </details>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

/** Driver Insurance Hub — platform dispute protection explained. */
export default function InsuranceHubPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/help"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to help"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Driver Coverage</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">What you&apos;re protected for when you charge on Zipgrid</p>
        </div>
      </div>

      {/* Coverage status badge */}
      <div className="mb-8 flex items-center gap-3 rounded-[8px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-4 py-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--primary))]">Your sessions are covered</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            All bookings made on Zipgrid include platform dispute protection at no extra charge.
          </p>
        </div>
      </div>

      {/* What's covered */}
      <section className="mb-8" aria-labelledby="covered-heading">
        <h2 id="covered-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-[hsl(var(--foreground))]">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          What you&apos;re covered for
        </h2>
        <ul className="flex flex-col gap-3">
          {COVERED.map((item) => (
            <li key={item.title} className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <p className="mb-1 text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</p>
              <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* What's NOT covered */}
      <section className="mb-8" aria-labelledby="not-covered-heading">
        <h2 id="not-covered-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-[hsl(var(--foreground))]">
          <ShieldX className="h-4 w-4 text-[hsl(var(--destructive))]" aria-hidden="true" />
          What is not covered
        </h2>
        <ul className="flex flex-col gap-3">
          {NOT_COVERED.map((item) => (
            <li key={item.title} className="rounded-[6px] border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card))] p-4 opacity-90">
              <p className="mb-1 text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</p>
              <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How to claim */}
      <section className="mb-8" aria-labelledby="claim-heading">
        <h2 id="claim-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-[hsl(var(--foreground))]">
          <FileText className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          How to raise a dispute
        </h2>
        <ol className="flex flex-col gap-4">
          {CLAIM_STEPS.map(({ step, label, detail }) => (
            <li key={step} className="flex gap-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)] text-xs font-bold text-[hsl(var(--primary))]">
                {step}
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link
          href="/help/resolution"
          className={cn(
            'mt-5 flex h-11 items-center justify-center gap-2 rounded-[6px]',
            'bg-[hsl(var(--primary))] text-sm font-semibold text-white transition-opacity hover:opacity-90',
          )}
        >
          Go to Resolution Centre
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      {/* Expected timelines */}
      <section className="mb-8 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
          <Clock className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          Expected resolution times
        </h2>
        <dl className="flex flex-col gap-2 text-sm">
          {[
            ['Simple billing errors', 'Within 2 business days'],
            ['Charger fault disputes', 'Within 5 business days'],
            ['Property damage claims', 'Within 10 business days'],
            ['Complex or escalated cases', 'Up to 20 business days'],
          ].map(([term, def]) => (
            <div key={term} className="flex items-start justify-between gap-4">
              <dt className="text-[hsl(var(--muted-foreground))]">{term}</dt>
              <dd className="text-right font-medium text-[hsl(var(--foreground))]">{def}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-[hsl(var(--foreground))]">
          <HelpCircle className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          Frequently asked questions
        </h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* Contact support */}
      <div className="mt-8 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4 text-center">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Can&apos;t find what you&apos;re looking for?{' '}
          <Link href="/help/chat" className="font-medium text-[hsl(var(--primary))] hover:underline">
            Chat with support
          </Link>
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Available 8am–10pm, 7 days a week. Average response: under 3 minutes.
        </p>
      </div>
    </div>
  )
}
