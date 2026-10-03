/**
 * @file page.tsx
 * @description Help Centre — /help
 * Answers to common questions, grouped by topic, plus routes to the AI
 * concierge (which also answers support questions), the Resolution Centre and
 * emergency charging. Answers must match how the platform actually works
 * (the same facts the concierge is given in ConciergeService).
 *
 * @module apps/web/app/(marketing)/help
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, BatteryCharging, ChevronRight, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Help Centre — Zipgrid',
  description:
    'Answers about booking, payments, cancelling, hosting, payouts and safety on Zipgrid, plus an AI concierge that can check your own bookings.',
  alternates: { canonical: 'https://zipgrid.co.uk/help' },
}

type Topic = { id: string; title: string; faqs: { q: string; a: string }[] }

const TOPICS: Topic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    faqs: [
      {
        q: 'How does Zipgrid work?',
        a: 'Homeowners, businesses and residential buildings list their EV chargers. Drivers book a time slot, either on the map or by asking the AI concierge, and pay through Zipgrid. Hosts are paid weekly.',
      },
      {
        q: 'Do I need to verify my ID?',
        a: 'Yes. Drivers verify their ID before their first booking, and hosts before a listing goes live. It\'s done with Stripe Identity and takes about two minutes: go to Profile → Identity verification.',
      },
    ],
  },
  {
    id: 'booking',
    title: 'Booking and charging',
    faqs: [
      {
        q: 'How do I book a charger?',
        a: 'Ask the concierge ("get me charged near Leeds tomorrow at 9") or search the map. Choose a time and your car, pay by wallet or card, and confirm.',
      },
      {
        q: 'What is Instant Book?',
        a: 'Instant Book chargers confirm your booking straight away. Other chargers send your request to the host to approve.',
      },
      {
        q: 'What do I need when I arrive?',
        a: 'Open the booking in Bookings. It has the address, the host\'s access instructions, your arrival code and the session PIN.',
      },
      {
        q: 'How do I cancel?',
        a: 'Cancel from the booking, or ask the concierge. It\'s free any time before charging starts, and the card hold or wallet reservation is released in full.',
      },
      {
        q: 'Can Zipgrid plan a long trip?',
        a: 'Yes. Use the Trip planner, or tell the concierge where you\'re going. You get charging stops that fit your car and are free when you arrive, each with a backup, and you can book them all at once.',
      },
      {
        q: 'I\'m running low. What now?',
        a: 'Use Emergency charging: enter your battery level and it shows chargers you can still reach, ready to book.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    faqs: [
      {
        q: 'Is there a booking fee?',
        a: 'No. You pay the price the host sets for your session, and nothing on top.',
      },
      {
        q: 'How do card holds work?',
        a: 'If your booking starts within 6 days, a hold is placed when you book; otherwise it\'s placed 24 hours before. Wallet bookings reserve funds the same way. After the session you\'re charged for what you used and the rest is released.',
      },
      {
        q: 'What if my session costs more than the hold?',
        a: 'The difference becomes an outstanding balance, taken from your wallet or card. Until it\'s paid you can\'t make new bookings; topping up your wallet clears it.',
      },
      {
        q: 'What is auto top-up?',
        a: 'An optional Wallet setting that tops up from your saved card when your balance runs low or a wallet booking is short. It runs at most 3 times a day, and turns itself off after two declined payments in a row.',
      },
      {
        q: 'What are idle fees?',
        a: 'Some chargers charge per minute if your car stays plugged in more than 10 minutes after charging finishes. The listing shows the rate.',
      },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting your charger',
    faqs: [
      {
        q: 'How do I list my charger?',
        a: 'Add your charger\'s details and location, set your hours, price and access instructions, accept the host terms, verify your ID and publish.',
      },
      {
        q: 'When do I get paid?',
        a: 'Weekly, by bank transfer through Stripe, once your earnings reach £5. Set up your payout account in Settings first.',
      },
      {
        q: 'What does hosting cost?',
        a: 'Starter is free with 15% commission on bookings (up to 3 chargers). Growth is £29/month with 12% commission, and Pro is £79/month with 8%. See Pricing for details.',
      },
      {
        q: 'Do I need insurance?',
        a: 'Yes. Zipgrid does not provide insurance. Tell your home insurer that you share your charger and check you have public liability cover. Settings → Insurance has a letter you can send.',
      },
      {
        q: 'How do I earn more?',
        a: 'Ask the revenue advisor. It compares your price and bookings with chargers nearby and suggests changes, which only happen when you confirm.',
      },
      {
        q: 'Can I manage a whole building?',
        a: 'Yes. Under Properties you can group chargers into a building\'s bays, invite residents, choose who can book, offer a resident discount and share revenue with residents.',
      },
    ],
  },
  {
    id: 'problems',
    title: 'Problems and safety',
    faqs: [
      {
        q: 'Something went wrong with a booking.',
        a: 'Raise it in the Resolution Centre as soon as you can, with photos and details. We review it with the booking record and tell both sides the outcome.',
      },
      {
        q: 'Someone is hurt or in danger.',
        a: 'Call 999 first. Then report it in the Resolution Centre as a Safety problem; safety reports go to the top of the review queue.',
      },
      {
        q: 'What is a charger\'s safety score?',
        a: 'A score from 0 to 100, recalculated daily from the charger\'s installation, fault reports and driver complaints. Chargers below 50 are paused for review.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    faqs: [
      {
        q: 'Can I download or delete my data?',
        a: 'Yes, both from Settings. Deleting your account refunds wallet top-ups to the cards they came from; promotional credit is lost. You can\'t delete it while you have open bookings or an outstanding balance.',
      },
    ],
  },
]

/** Help Centre page. */
export default function HelpPage() {
  return (
    <>
      <section aria-label="Help Centre" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-5xl">How can we help?</h1>
          <p className="text-base text-[hsl(var(--muted-foreground))]">
            Browse the answers below, or ask the concierge. It can also check your own bookings, wallet and charging.
          </p>
          <nav aria-label="Help topics" className="flex flex-wrap justify-center gap-2 pt-2">
            {TOPICS.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1 text-sm text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.4)]">
                {t.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section aria-label="Get help" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:px-8">
          <HelpCard
            icon={MessageCircle}
            title="Ask the concierge"
            body="Questions about payments, cancelling or hosting, any time of day. It can look up your own bookings."
            href="/concierge"
            cta="Start a chat"
            primary
          />
          <HelpCard
            icon={AlertTriangle}
            title="Report a problem"
            body="Damage, billing, a dispute or a safety problem. If anyone is in danger, call 999 first."
            href="/help/resolution"
            cta="Resolution Centre"
          />
          <HelpCard
            icon={BatteryCharging}
            title="Running low on charge?"
            body="See chargers you can still reach and book one straight away."
            href="/emergency"
            cta="Emergency charging"
          />
        </div>
      </section>

      <section aria-label="Frequently asked questions" className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-16 sm:px-6 lg:px-8">
          {TOPICS.map((t) => (
            <div key={t.id} id={t.id} className="scroll-mt-20">
              <h2 className="mb-3 text-xl font-semibold text-[hsl(var(--foreground))]">{t.title}</h2>
              <div className="flex flex-col gap-2">
                {t.faqs.map((f) => (
                  <details key={f.q} className="group rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-[hsl(var(--foreground))]">
                      {f.q}
                      <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-open:rotate-90" aria-hidden="true" />
                    </summary>
                    <p className="border-t border-[hsl(var(--border))] px-4 py-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function HelpCard({ icon: Icon, title, body, href, cta, primary }: {
  icon: typeof MessageCircle
  title: string
  body: string
  href: string
  cta: string
  primary?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <Icon className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
      <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h3>
      <p className="flex-1 text-sm text-[hsl(var(--muted-foreground))]">{body}</p>
      <Link
        href={href}
        className={cn(
          'flex min-h-[40px] w-fit items-center gap-2 rounded-[6px] px-4 py-2 text-sm font-semibold transition-opacity',
          primary
            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            : 'border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.4)]',
        )}
      >
        {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
