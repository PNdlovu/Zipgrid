/**
 * @file page.tsx
 * @description /host/settings/insurance — Host-facing Insurance Hub.
 * Shows the Host Protection Guarantee summary, active coverage status,
 * claim history, and the insurer notification letter template.
 *
 * @module apps/web/app/(host)/settings/insurance
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ShieldCheck, ShieldX, FileText,
  CheckCircle2, Clock, ExternalLink, ChevronRight,
  HelpCircle, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ListingStatus = {
  id: string
  title: string
  isActive: boolean
  isVerified: boolean
}

/* ── Coverage items ─────────────────────────────────────────── */

const COVERED_ITEMS = [
  {
    title: 'Third-party injury during a session',
    detail: 'If a driver or visitor is injured while accessing your charger during a confirmed booking, Zipgrid\'s £1M CGL umbrella covers legal liability.',
  },
  {
    title: 'Charger-caused property damage',
    detail: 'Damage to a driver\'s vehicle caused by a fault in your charger during a session is covered under the Host Protection Guarantee.',
  },
  {
    title: 'Driver-caused property damage to your property',
    detail: 'If a driver damages your property during a session (e.g. gate damage), Zipgrid\'s guarantee covers repair costs after a £250 excess.',
  },
  {
    title: 'Session revenue loss from platform error',
    detail: 'If a confirmed booking fails to complete due to a Zipgrid platform error (not a charger hardware fault), we\'ll compensate the estimated session value.',
  },
]

const EXCLUDED_ITEMS = [
  {
    title: 'Damage before or after the booking window',
    detail: 'The guarantee only applies during confirmed booking windows. Damage outside these times is not covered.',
  },
  {
    title: 'Pre-existing charger faults',
    detail: 'If your charger had a known fault before you listed it, claims arising from that fault are excluded.',
  },
  {
    title: 'Deliberate damage or fraud',
    detail: 'Claims that arise from intentional damage, misrepresentation, or fraud are excluded and may result in account suspension.',
  },
  {
    title: 'Sessions on unverified listings',
    detail: 'Your listing must have completed the safety checklist and been verified. Sessions on listings with a safety score below 50 may not be covered.',
  },
]

const FAQ_ITEMS = [
  {
    q: 'Does Zipgrid notify my home insurer?',
    a: 'Zipgrid does not notify your insurer — but you should. Most home insurance policies require you to declare commercial use. Download the template letter below to notify your insurer. Failure to declare could invalidate your home policy.',
  },
  {
    q: 'What does "£1M CGL umbrella" mean?',
    a: 'Zipgrid holds a Commercial General Liability insurance policy with a £1 million per-occurrence limit. This covers claims made against you as a result of injuries or property damage during a session on your listing.',
  },
  {
    q: 'How do I make a claim?',
    a: 'Report the incident immediately via the admin dispute queue (or contact support). Preserve all evidence — photos, communication, receipts. Our claims team will guide you through the process.',
  },
]

/* ── Accordion ──────────────────────────────────────────────── */

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

export default function HostInsuranceHubPage() {
  const [listings, setListings] = useState<ListingStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/host/listings')
      .then((r) => r.json())
      .then((d: { data: Array<{ id: string; title: string; status: string; isSmartCharger: boolean }> }) => {
        setListings(
          (d.data ?? []).map((l) => ({
            id: l.id,
            title: l.title,
            isActive: l.status === 'active',
            isVerified: true, // simplified — full verification is in the safety score
          })),
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const hasActiveListings = listings.some((l) => l.isActive)

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Host Protection Guarantee</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Your coverage while hosting on Zipgrid</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">

          {/* Coverage status */}
          <div className={cn(
            'flex items-start gap-4 rounded-[8px] border p-4',
            hasActiveListings
              ? 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)]'
              : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))]',
          )}>
            <ShieldCheck className={cn(
              'h-6 w-6 mt-0.5 shrink-0',
              hasActiveListings ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]',
            )} aria-hidden="true" />
            <div>
              <p className={cn('font-semibold', hasActiveListings ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]')}>
                {loading ? 'Checking coverage…'
                  : hasActiveListings ? 'Your coverage is active'
                  : 'No active listings — coverage paused'}
              </p>
              <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
                {hasActiveListings
                  ? 'All active listings are covered under Zipgrid\'s £1M CGL umbrella policy while sessions are in progress.'
                  : 'Publish a listing to activate host coverage.'}
              </p>
              {hasActiveListings && (
                <ul className="mt-2 flex flex-col gap-1">
                  {listings.filter((l) => l.isActive).map((l) => (
                    <li key={l.id} className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                      <CheckCircle2 className="h-3 w-3 text-[hsl(var(--primary))]" aria-hidden="true" />
                      {l.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* What's covered */}
          <section aria-labelledby="covered-heading">
            <h2 id="covered-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              What the guarantee covers
            </h2>
            <ul className="flex flex-col gap-2">
              {COVERED_ITEMS.map((item) => (
                <li key={item.title} className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* What's NOT covered */}
          <section aria-labelledby="excluded-heading">
            <h2 id="excluded-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <ShieldX className="h-4 w-4 text-[hsl(var(--destructive))]" aria-hidden="true" />
              What is not covered
            </h2>
            <ul className="flex flex-col gap-2">
              {EXCLUDED_ITEMS.map((item) => (
                <li key={item.title} className="rounded-[6px] border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--card))] p-4">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* FAQ */}
          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <HelpCircle className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Common questions
            </h2>
            <div className="flex flex-col gap-2">
              {FAQ_ITEMS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </section>
        </div>

        {/* Right panel */}
        <aside className="flex flex-col gap-4">

          {/* Insurer letter */}
          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <FileText className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Notify your home insurer
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              If you have home contents or buildings insurance, you should declare that you\'re using your property commercially. Use this template to notify your insurer.
            </p>
            <div className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3 text-xs">
              <p className="mb-1 font-semibold text-[hsl(var(--foreground))]">Letter template (plain text)</p>
              <div className="text-[hsl(var(--muted-foreground))] whitespace-pre-wrap leading-relaxed">{`Dear [Insurer Name],

I am writing to notify you that I have begun using my property at [Your Address] for the commercial rental of an EV charging point via the Zipgrid platform.

The charger is a [Brand + Model] installed by a qualified electrician. Sessions are conducted via Zipgrid's booking system and covered by Zipgrid's commercial general liability insurance (£1M per occurrence).

Please confirm whether this use requires an amendment to my current policy.

Yours faithfully,
[Your Name]`}</div>
            </div>
          </div>

          {/* Resolution Centre link */}
          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Report an incident</h3>
            <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
              Use the Resolution Centre to report property damage, a driver complaint, or a billing issue.
            </p>
            <Link
              href="/driver/help/resolution"
              className="flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
            >
              Resolution Centre
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {/* Support */}
          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Emergency incident?
            </h3>
            <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
              If someone has been injured or there is an immediate safety risk, call 999 first. Then notify Zipgrid urgently.
            </p>
            <Link
              href="/help/chat"
              className="flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--destructive))] text-sm font-semibold text-white hover:opacity-90"
            >
              Contact support now
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {/* Timeline */}
          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <Clock className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Claim timelines
            </h3>
            <dl className="flex flex-col gap-2 text-xs">
              {[
                ['Billing disputes', '2 business days'],
                ['Property damage', '5 business days'],
                ['Complex cases', 'Up to 20 days'],
              ].map(([t, d]) => (
                <div key={t as string} className="flex items-center justify-between gap-2">
                  <dt className="text-[hsl(var(--muted-foreground))]">{t}</dt>
                  <dd className="font-semibold text-[hsl(var(--foreground))]">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
