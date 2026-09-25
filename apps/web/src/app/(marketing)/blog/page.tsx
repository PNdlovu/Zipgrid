/**
 * @file page.tsx
 * @description Blog index page — /blog
 * EV guides, earnings stories, product news, policy updates.
 * Contentlayer + MDX — articles live in content/blog/*.mdx
 * Shell version: renders category nav and placeholder article cards.
 * Full MDX integration wired in Module F (Content & Blog System build).
 *
 * @module apps/web/app/(marketing)/blog
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'
import { SectionHeader } from '@/components/marketing/SectionHeader'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Blog — EV Charging Guides, Earnings Stories & Product News',
  description:
    'EV charging guides, host earnings stories, product updates, and policy news. Written for UK EV owners, homeowners, and businesses.',
  alternates: { canonical: 'https://zipgrid.co.uk/blog' },
}

const CATEGORIES = [
  { slug: 'all', label: 'All' },
  { slug: 'ev-guides', label: 'EV Guides' },
  { slug: 'host-stories', label: 'Host Stories' },
  { slug: 'product-news', label: 'Product News' },
  { slug: 'policy-tailwinds', label: 'Policy & Market' },
  { slug: 'trip-planning', label: 'Trip Planning' },
  { slug: 'cost-savings', label: 'Cost Savings' },
] as const

/** Featured article placeholder — replaced by real MDX data in Module F */
const FEATURED_ARTICLE = {
  slug: 'how-much-can-you-earn-from-your-home-charger',
  category: 'Host Stories',
  title: 'How much can you really earn from your home EV charger?',
  excerpt:
    'We analysed 500 UK host listings and 3 months of session data. Here\'s the honest breakdown of what hosts earn — and how to maximise it.',
  readMinutes: 7,
  publishedAt: 'September 24, 2026',
  author: 'Zipgrid Editorial',
} as const

/** Article card placeholders — replaced by real Contentlayer allPosts in Module F */
const PLACEHOLDER_ARTICLES = [
  {
    slug: 'ev-charger-brands-compared-uk-2026',
    category: 'EV Guides',
    title: 'EV home charger brands compared: EO, Zappi, Ohme, Andersen, and Rolec',
    excerpt: 'What the specs don\'t tell you — real-world OCPP reliability, app quality, and smart scheduling for UK tariffs.',
    readMinutes: 9,
    publishedAt: 'September 22, 2026',
  },
  {
    slug: 'octopus-agile-smart-charging-guide',
    category: 'Cost Savings',
    title: 'Octopus Agile and smart charging: how to pay under 5p/kWh',
    excerpt: 'The Agile tariff can be genuinely free at some slots. Here\'s how Zipgrid\'s scheduler exploits every cheap window.',
    readMinutes: 6,
    publishedAt: 'September 19, 2026',
  },
  {
    slug: 'uk-ev-charging-infrastructure-2026',
    category: 'Policy & Market',
    title: 'UK EV infrastructure in 2026: what the government data actually shows',
    excerpt: 'Public charging growth is not keeping pace with EV sales. That\'s exactly why P2P host charging exists.',
    readMinutes: 8,
    publishedAt: 'September 15, 2026',
  },
  {
    slug: 'manchester-to-london-ev-trip-planner',
    category: 'Trip Planning',
    title: 'Manchester to London in an EV: the definitive charging stop guide',
    excerpt: 'Real timings, real prices, real reliability ratings for every charging stop on the M6/M1 corridor in 2026.',
    readMinutes: 11,
    publishedAt: 'September 10, 2026',
  },
  {
    slug: 'zipgrid-voice-commands-complete-guide',
    category: 'Product News',
    title: 'Every Zipgrid voice command: the complete 2026 guide',
    excerpt: 'From "charge now" to full multi-stop trip planning. All 90+ commands, with examples and tips.',
    readMinutes: 5,
    publishedAt: 'September 8, 2026',
  },
] as const

/**
 * Blog index page — article listing shell.
 * Full Contentlayer MDX integration added in Module F.
 */
export default function BlogPage() {
  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        aria-label="Blog page header"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              Zipgrid Blog
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-5xl">
              Guides, stories, and updates.
            </h1>
            <p className="mt-2 max-w-xl text-base text-[hsl(var(--muted-foreground))]">
              Written for UK EV owners, homeowners, and businesses. No jargon, no fluff.
            </p>
          </div>
        </div>
      </section>

      {/* ── CATEGORY NAV ─────────────────────────────────────────── */}
      <section
        aria-label="Blog categories"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <nav aria-label="Article categories">
            <ul role="list" className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ slug, label }) => (
                <li key={slug}>
                  <Link
                    href={slug === 'all' ? '/blog' : `/blog/category/${slug}`}
                    className={cn(
                      'rounded-[6px] border px-3 py-1.5 text-sm font-medium transition-colors',
                      slug === 'all'
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]'
                        : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                    )}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* ── FEATURED ARTICLE ─────────────────────────────────────── */}
      <section
        aria-label="Featured article"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href={`/blog/${FEATURED_ARTICLE.slug}`}
            className={cn(
              'group flex flex-col gap-5 rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--card))] p-8 transition-colors hover:border-[hsl(var(--primary)/0.4)]',
              'sm:flex-row sm:items-center',
            )}
            aria-label={`Featured: ${FEATURED_ARTICLE.title}`}
          >
            {/* Featured icon */}
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--primary)/0.08)]"
              aria-hidden="true"
            >
              <Zap className="h-8 w-8 text-[hsl(var(--primary))]" strokeWidth={1.5} />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-[4px] bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                  Featured
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{FEATURED_ARTICLE.category}</span>
              </div>
              <h2 className="text-xl font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                {FEATURED_ARTICLE.title}
              </h2>
              <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                {FEATURED_ARTICLE.excerpt}
              </p>
              <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                <span>{FEATURED_ARTICLE.publishedAt}</span>
                <span aria-hidden="true">·</span>
                <span>{FEATURED_ARTICLE.readMinutes} min read</span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* ── ARTICLE GRID ─────────────────────────────────────────── */}
      <section
        aria-label="Recent articles"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeader align="left" headline="Recent articles" />
          <ul
            role="list"
            className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {PLACEHOLDER_ARTICLES.map(({ slug, category, title, excerpt, readMinutes, publishedAt }) => (
              <li key={slug}>
                <Link
                  href={`/blog/${slug}`}
                  className={cn(
                    'group flex h-full flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))]',
                    'bg-[hsl(var(--card))] p-6 transition-colors hover:border-[hsl(var(--primary)/0.4)]',
                  )}
                  aria-label={title}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                    {category}
                  </span>
                  <h3 className="text-base font-semibold leading-snug text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                    {title}
                  </h3>
                  <p className="flex-1 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    {excerpt}
                  </p>
                  <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
                    <span>{publishedAt}</span>
                    <span className="flex items-center gap-1 text-[hsl(var(--primary))]">
                      Read <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
