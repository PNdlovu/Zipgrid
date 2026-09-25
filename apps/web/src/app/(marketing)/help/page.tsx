/**
 * @file page.tsx
 * @description Help Centre page — /help
 * Knowledge base index with 13 categories, search bar (wired to AI in Module F),
 * popular articles list, and contact/escalation options.
 *
 * @module apps/web/app/(marketing)/help
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Search,
  BookOpen,
  Zap,
  CreditCard,
  MapPin,
  Settings,
  Shield,
  MessageCircle,
  Users,
  Package,
  BarChart3,
  Mic,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Help Centre — Zipgrid Support and Knowledge Base',
  description:
    'Find answers to your questions about EV charging, bookings, payments, and hosting on Zipgrid. 24/7 AI support available.',
  alternates: { canonical: 'https://zipgrid.co.uk/help' },
}

const HELP_CATEGORIES = [
  { slug: 'getting-started', icon: BookOpen, label: 'Getting started', articles: 12 },
  { slug: 'finding-charging', icon: MapPin, label: 'Finding charging', articles: 18 },
  { slug: 'bookings', icon: Zap, label: 'Bookings & sessions', articles: 24 },
  { slug: 'payments', icon: CreditCard, label: 'Payments & billing', articles: 16 },
  { slug: 'hosting', icon: Settings, label: 'Hosting your charger', articles: 21 },
  { slug: 'safety-insurance', icon: Shield, label: 'Safety & insurance', articles: 9 },
  { slug: 'account', icon: Users, label: 'Account & profile', articles: 14 },
  { slug: 'voice-ai', icon: Mic, label: 'Voice & AI features', articles: 11 },
  { slug: 'marketplace', icon: Package, label: 'Marketplace', articles: 8 },
  { slug: 'for-businesses', icon: BarChart3, label: 'For businesses', articles: 15 },
  { slug: 'technical', icon: Settings, label: 'Technical issues', articles: 19 },
  { slug: 'contact', icon: MessageCircle, label: 'Contact support', articles: 4 },
] as const

const POPULAR_ARTICLES = [
  { slug: 'how-do-i-list-my-charger', category: 'Hosting', title: 'How do I list my charger?' },
  { slug: 'how-to-book-a-charger', category: 'Bookings', title: 'How do I book a charger?' },
  { slug: 'when-will-i-get-paid', category: 'Payments', title: 'When will I receive my payout?' },
  { slug: 'access-pin-not-working', category: 'Bookings', title: 'My access PIN isn\'t working' },
  { slug: 'how-does-instant-book-work', category: 'Bookings', title: 'What is Instant Book?' },
  { slug: 'charger-showing-offline', category: 'Technical', title: 'My charger is showing as offline' },
  { slug: 'cancel-booking-policy', category: 'Bookings', title: 'How do I cancel a booking?' },
  { slug: 'host-protection-guarantee', category: 'Safety', title: 'What does the Host Protection Guarantee cover?' },
  { slug: 'compatible-charger-brands', category: 'Technical', title: 'Which charger brands are compatible?' },
] as const

/**
 * Help Centre page — knowledge base index.
 * AI search widget and full article content loaded in Module F.
 */
export default function HelpPage() {
  return (
    <>
      {/* ── HERO WITH SEARCH ─────────────────────────────────────── */}
      <section
        aria-label="Help Centre search"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-5xl">
              How can we help?
            </h1>
            <p className="text-base text-[hsl(var(--muted-foreground))]">
              Search the knowledge base, or browse by category below.
            </p>

            {/* Search bar — AI-powered in Module F */}
            <div className="relative w-full max-w-xl">
              <label htmlFor="help-search" className="sr-only">
                Search help articles
              </label>
              <div
                className="pointer-events-none absolute inset-y-0 left-4 flex items-center"
                aria-hidden="true"
              >
                <Search className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              </div>
              <input
                id="help-search"
                type="search"
                placeholder="Search help articles..."
                autoComplete="off"
                className={cn(
                  'h-12 w-full rounded-[6px] border border-[hsl(var(--border))]',
                  'bg-[hsl(var(--background))] pl-11 pr-4 text-sm text-[hsl(var(--foreground))]',
                  'placeholder:text-[hsl(var(--muted-foreground))]',
                  'focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.3)]',
                )}
                aria-label="Search help articles"
              />
            </div>

            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              AI-powered search · 100+ articles · 24/7 AI support
            </p>
          </div>
        </div>
      </section>

      {/* ── CATEGORY GRID ────────────────────────────────────────── */}
      <section
        aria-label="Help categories"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-xl font-semibold text-[hsl(var(--foreground))]">
            Browse by topic
          </h2>
          <ul
            role="list"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {HELP_CATEGORIES.map(({ slug, icon: Icon, label, articles }) => (
              <li key={slug}>
                <Link
                  href={`/help/${slug}`}
                  className={cn(
                    'group flex items-center gap-4 rounded-[6px] border border-[hsl(var(--border))]',
                    'bg-[hsl(var(--card))] p-5 transition-colors',
                    'hover:border-[hsl(var(--primary)/0.4)] hover:bg-[hsl(var(--secondary))]',
                  )}
                  aria-label={`${label} — ${articles} articles`}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.08)]"
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                      {label}
                    </span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {articles} articles
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── POPULAR ARTICLES ─────────────────────────────────────── */}
      <section
        aria-label="Popular help articles"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-xl font-semibold text-[hsl(var(--foreground))]">
            Popular articles
          </h2>
          <ul role="list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {POPULAR_ARTICLES.map(({ slug, category, title }) => (
              <li key={slug}>
                <Link
                  href={`/help/${slug}`}
                  className={cn(
                    'group flex items-center justify-between gap-4 rounded-[6px] border',
                    'border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4',
                    'transition-colors hover:border-[hsl(var(--primary)/0.4)]',
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                      {category}
                    </span>
                    <span className="text-sm font-medium text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                      {title}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── AI SUPPORT CTA ───────────────────────────────────────── */}
      <section
        aria-label="Get help from AI support"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* AI chat */}
            <div className={cn(
              'flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--card))] p-7',
            )}>
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.1)]" aria-hidden="true">
                <MessageCircle className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                Chat with our AI assistant
              </h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Available 24/7. Resolves 80% of queries instantly without waiting for a human. For
                issues it can&apos;t solve, it hands off to our support team with full context.
              </p>
              <Link
                href="/help/chat"
                className={cn(
                  'flex min-h-[44px] w-fit items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
                  'px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))]',
                  'transition-opacity hover:opacity-90',
                )}
              >
                Start chat
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {/* Human support */}
            <div className={cn(
              'flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--card))] p-7',
            )}>
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[hsl(var(--secondary))]" aria-hidden="true">
                <Users className="h-5 w-5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                Talk to a human
              </h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Our support team is available Mon–Fri 09:00–18:00 GMT. Safety incidents are
                handled 24/7 with a 15-minute response SLA.
              </p>
              <Link
                href="/help/contact"
                className={cn(
                  'flex min-h-[44px] w-fit items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
                  'px-5 py-2.5 text-sm font-medium text-[hsl(var(--foreground))]',
                  'transition-colors hover:border-[hsl(var(--primary)/0.4)]',
                )}
              >
                Contact support
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
