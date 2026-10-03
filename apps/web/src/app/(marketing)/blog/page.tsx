/**
 * @file page.tsx
 * @description Blog index page — /blog
 * EV guides, earnings stories, product news, policy updates.
 * Articles come from src/content/blog.ts. ?category=<slug> filters the list.
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
import { ARTICLES, BLOG_CATEGORIES } from '@/content/blog'

export const metadata: Metadata = {
  title: 'Blog — EV Charging Guides, Earnings Stories & Product News',
  description:
    'EV charging guides, host earnings stories, product updates, and policy news. Written for UK EV owners, homeowners, and businesses.',
  alternates: { canonical: 'https://zipgrid.co.uk/blog' },
}

type Props = { searchParams: Promise<{ category?: string }> }

/** Page at /blog — article index, optionally filtered by category. */
export default async function BlogPage({ searchParams }: Props) {
  const { category } = await searchParams
  const active = BLOG_CATEGORIES.find((c) => c.slug === category) ?? null
  const featured = ARTICLES[0]
  const listed = active ? ARTICLES.filter((a) => a.category === active.category) : ARTICLES.slice(1)
  const chips = [{ slug: 'all', label: 'All' }, ...BLOG_CATEGORIES]

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
              {chips.map(({ slug, label }) => (
                <li key={slug}>
                  <Link
                    href={slug === 'all' ? '/blog' : `/blog?category=${slug}`}
                    aria-current={(active?.slug ?? 'all') === slug ? 'page' : undefined}
                    className={cn(
                      'rounded-[6px] border px-3 py-1.5 text-sm font-medium transition-colors',
                      (active?.slug ?? 'all') === slug
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
      {!active && featured && (
      <section
        aria-label="Featured article"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href={`/blog/${featured.slug}`}
            className={cn(
              'group flex flex-col gap-5 rounded-[6px] border border-[hsl(var(--border))]',
              'bg-[hsl(var(--card))] p-8 transition-colors hover:border-[hsl(var(--primary)/0.4)]',
              'sm:flex-row sm:items-center',
            )}
            aria-label={`Featured: ${featured.title}`}
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
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{featured.category}</span>
              </div>
              <h2 className="text-xl font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                {featured.title}
              </h2>
              <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                {featured.excerpt}
              </p>
              <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                <span>{featured.publishedAt}</span>
                <span aria-hidden="true">·</span>
                <span>{featured.readMinutes} min read</span>
              </div>
            </div>
          </Link>
        </div>
      </section>
      )}

      {/* ── ARTICLE GRID ─────────────────────────────────────────── */}
      <section
        aria-label="Recent articles"
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]"
      >
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <SectionHeader align="left" headline={active ? active.label : 'Recent articles'} />
          {listed.length === 0 && (
            <p className="mt-8 text-sm text-[hsl(var(--muted-foreground))]">No articles in this category yet.</p>
          )}
          <ul
            role="list"
            className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {listed.map(({ slug, category, title, excerpt, readMinutes, publishedAt }) => (
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
                    <span>{publishedAt} · {readMinutes} min read</span>
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
