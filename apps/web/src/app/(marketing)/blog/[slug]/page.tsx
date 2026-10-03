/**
 * @file page.tsx
 * @description /blog/[slug] — Blog article page.
 * Articles come from src/content/blog.ts (shared with the /blog index).
 *
 * @module apps/web/app/(marketing)/blog/[slug]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Calendar, User, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ARTICLES, findArticle } from '@/content/blog'

/* ── Static params ───────────────────────────────────────── */

/** Pre-renders every published article slug at build time. */
export function generateStaticParams() {
  return ARTICLES.map(({ slug }) => ({ slug }))
}

/* ── Metadata ────────────────────────────────────────────── */

type Props = { params: Promise<{ slug: string }> }

/** SEO/Open Graph metadata for an article. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const article = findArticle(slug)
  if (!article) return { title: 'Article not found — Zipgrid' }
  return {
    title: `${article.title} — Zipgrid Blog`,
    description: article.excerpt,
    openGraph: { title: article.title, description: article.excerpt, type: 'article' },
    alternates: { canonical: `https://zipgrid.co.uk/blog/${slug}` },
  }
}

/* ── Page ────────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  'Host Stories':   'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
  'Cost Savings':   'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  'Policy & Market':'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  'EV Guides':      'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  'Product News':   'bg-[hsl(var(--primary)_/_8%)] text-[hsl(var(--primary))]',
  'Trip Planning':  'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
}

/** Page at /blog/[slug] — Blog article page. */
export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params
  const article = findArticle(slug)
  if (!article) notFound()

  const categoryColor = CATEGORY_COLORS[article.category] ?? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

      {/* Back to blog */}
      <Link
        href="/blog"
        className="mb-8 flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to blog
      </Link>

      <article itemScope itemType="https://schema.org/Article">

        {/* Category */}
        <div className="mb-4 flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', categoryColor)}>
            <Tag className="mr-1 inline h-3 w-3" aria-hidden="true" />
            {article.category}
          </span>
        </div>

        {/* Title */}
        <h1
          itemProp="headline"
          className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl"
        >
          {article.title}
        </h1>

        {/* Excerpt */}
        <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))] leading-relaxed">
          {article.excerpt}
        </p>

        {/* Meta row */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-t border-[hsl(var(--border))] py-4 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            <span itemProp="author">{article.author}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            <time itemProp="datePublished" dateTime={article.publishedAt}>{article.publishedAt}</time>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {article.readMinutes} min read
          </span>
        </div>

        {/* Body — rendered as HTML until Contentlayer/MDX is wired */}
        {/* In Module F: replace with <Mdx code={post.body.code} /> */}
        <div
          itemProp="articleBody"
          className={cn(
            'prose prose-sm sm:prose-base dark:prose-invert mt-8 max-w-none',
            'prose-headings:font-semibold prose-headings:tracking-tight',
            'prose-a:text-[hsl(var(--primary))] prose-a:no-underline hover:prose-a:underline',
            'prose-p:text-[hsl(var(--foreground))] prose-p:leading-7',
            'prose-strong:text-[hsl(var(--foreground))]',
          )}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled static content
          dangerouslySetInnerHTML={{ __html: article.body }}
        />

        {/* CTA */}
        <div className="mt-12 rounded-[6px] border border-[hsl(var(--primary)_/_20%)] bg-[hsl(var(--primary)_/_5%)] p-6 text-center">
          <p className="text-base font-semibold">Try Zipgrid free</p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Find a charger near you or list your own. No subscription required.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/listings"
              className="rounded-[6px] bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Find a charger
            </Link>
            <Link
              href="/register?role=host"
              className="rounded-[6px] border border-[hsl(var(--border))] px-5 py-2.5 text-sm font-medium hover:bg-[hsl(var(--muted))]"
            >
              List your charger
            </Link>
          </div>
        </div>

      </article>
    </div>
  )
}
