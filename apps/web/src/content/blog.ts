/**
 * @file blog.ts
 * @description Blog articles and categories — the single source for /blog and
 * /blog/[slug]. Bodies are trusted, static HTML authored in this file.
 *
 * @module content/blog
 */

export type ArticleMeta = {
  slug: string
  title: string
  excerpt: string
  category: string
  author: string
  publishedAt: string
  readMinutes: number
  /** Trusted, static HTML authored in this file. */
  body: string
}

/** Category chips on /blog; `category` matches ArticleMeta.category. */
export const BLOG_CATEGORIES = [
  { slug: 'ev-guides', label: 'EV Guides', category: 'EV Guides' },
  { slug: 'host-stories', label: 'Host Stories', category: 'Host Stories' },
  { slug: 'product-news', label: 'Product News', category: 'Product News' },
  { slug: 'policy-tailwinds', label: 'Policy & Market', category: 'Policy & Market' },
  { slug: 'trip-planning', label: 'Trip Planning', category: 'Trip Planning' },
  { slug: 'cost-savings', label: 'Cost Savings', category: 'Cost Savings' },
] as const

/**
 * Published articles, newest first. Every claim in an article must be true and
 * checkable: no figures from data we don't have, no features the platform
 * doesn't offer. (The launch drafts were withdrawn on 2026-10-03 for this reason;
 * they are in git history.)
 */
export const ARTICLES: ArticleMeta[] = []

/** The article for a slug, or undefined. */
export function findArticle(slug: string): ArticleMeta | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}
