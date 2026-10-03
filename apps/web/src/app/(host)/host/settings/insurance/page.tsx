/**
 * @file page.tsx
 * @description /host/settings/insurance — what hosts need to be covered and
 * what Zipgrid does to protect them. Zipgrid does not insure hosts: hosts keep
 * their own home / public liability cover that includes sharing their charger.
 *
 * @module apps/web/app/(host)/settings/insurance
 */

import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, FileText, HelpCircle, ShieldCheck } from 'lucide-react'

/* ── Content ────────────────────────────────────────────────── */

const YOUR_COVER = [
  {
    title: 'Home or buildings insurance that allows charger sharing',
    detail: 'Tell your insurer you let drivers use your charger through Zipgrid. Some policies need an amendment; not telling them could affect a claim.',
  },
  {
    title: 'Public liability cover',
    detail: 'Covers you if a driver or visitor is injured, or their property is damaged, while using your charger. Many home policies include it; check the limit.',
  },
  {
    title: 'A safe, certified installation',
    detail: 'Your charger should be installed by a qualified electrician (NICEIC, NAPIT or ECA) with RCD protection, and kept in good repair.',
  },
]

const ZIPGRID_DOES = [
  { title: 'ID-verified drivers', detail: 'Every driver verifies their ID before they can book.' },
  { title: 'Payment secured before arrival', detail: 'A card hold or wallet reservation is in place before a session, and the session is charged at the price you set.' },
  { title: 'A record of every booking', detail: 'Who booked, when, the arrival code used and the session data, ready if you need to make a claim.' },
  { title: 'Reviews both ways', detail: 'Drivers and hosts review each other after every booking.' },
  { title: 'Incident reporting and the Resolution Centre', detail: 'Report damage or a problem with a driver within 14 days and we review it with the booking and charging-session record.' },
  { title: 'Damage recovered from the driver', detail: 'If a driver damaged your property, we charge them the repair cost (up to £1,000) and pay it to you in full, with no commission. Larger losses go to your insurer, with our booking record.' },
]

const FAQ_ITEMS = [
  {
    q: 'Does Zipgrid insure me?',
    a: 'No. Zipgrid is the booking and payment platform; it does not provide insurance. Keep your own home and public liability cover, and tell your insurer that you share your charger.',
  },
  {
    q: 'A driver damaged my property. What should I do?',
    a: 'Take photos straight away, then open the booking and choose Report a problem (within 14 days). Add a repair quote or invoice. We review it with the booking record and the driver\'s side, and if the driver is responsible we recover the cost from them for you.',
  },
  {
    q: 'Is the driver responsible for damage they cause?',
    a: 'Yes. Drivers agree to use chargers with care and are responsible for damage they cause. Once we have reviewed both sides, we collect up to £1,000 from the driver\'s wallet or card and add it to your next payout. See the Host Terms at /legal/host-terms.',
  },
]

const LETTER = `Dear [Insurer Name],

I am writing to let you know that I share the electric vehicle charger at [Your Address] with other drivers through the Zipgrid booking platform. Drivers book a time slot in advance, verify their identity with Zipgrid and pay through the platform.

The charger is a [Brand and Model], installed by a qualified electrician in [Year], with RCD protection.

Please confirm whether my current policy covers this use, including public liability for people using the charger, or whether it needs to be amended.

Yours faithfully,
[Your Name]
[Policy Number]`

/* ── Page ───────────────────────────────────────────────────── */

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

function ItemList({ items }: { items: { title: string; detail: string }[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.title} className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{item.detail}</p>
        </li>
      ))}
    </ul>
  )
}

/** Page at /host/settings/insurance — insurance and protection for hosts. */
export default function HostInsurancePage() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link
          href="/host/settings"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Insurance and protection</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">What you need, and what Zipgrid does to protect you</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-sm text-[hsl(var(--foreground))]">
          Zipgrid does not provide insurance. Before you take bookings, check that your own insurance covers other people using your charger.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section aria-labelledby="cover-heading">
            <h2 id="cover-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <ShieldCheck className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Cover you need
            </h2>
            <ItemList items={YOUR_COVER} />
          </section>

          <section aria-labelledby="zipgrid-heading">
            <h2 id="zipgrid-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              What Zipgrid does
            </h2>
            <ItemList items={ZIPGRID_DOES} />
          </section>

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

        <aside className="flex flex-col gap-4">
          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <FileText className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
              Tell your insurer
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              Copy this into an email or letter to your insurer.
            </p>
            <div className="whitespace-pre-wrap rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              {LETTER}
            </div>
          </div>

          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Report a problem</h3>
            <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
              Property damage, a driver complaint or a billing issue.
            </p>
            <Link
              href="/help/resolution"
              className="flex h-9 items-center justify-center gap-2 rounded-[6px] border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
            >
              Resolution Centre
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Someone hurt or in danger?
            </h3>
            <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
              Call 999 first. Then report it in the Resolution Centre as a Safety problem.
            </p>
            <Link
              href="/help/resolution"
              className="flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[hsl(var(--destructive))] text-sm font-semibold text-white hover:opacity-90"
            >
              Report a safety problem
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
