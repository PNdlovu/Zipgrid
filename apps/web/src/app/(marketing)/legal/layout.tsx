/**
 * @file layout.tsx
 * @description Shared layout for /legal/* — policy navigation beside a
 * readable prose column. Policy versions and dates come from policies.ts,
 * so a version bump shows on the page and is recorded on acceptance.
 *
 * @module apps/web/app/(marketing)/legal
 */

import Link from 'next/link'
import { POLICIES } from '@/domains/compliance/policies'

const OTHER_PAGES = [
  { href: '/legal/security', title: 'Security' },
  { href: '/legal/accessibility', title: 'Accessibility' },
]

/** Legal layout — side navigation and prose styles for policy pages. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const links = [...Object.values(POLICIES).map((p) => ({ href: p.path, title: p.title })), ...OTHER_PAGES]
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-16">
      <nav aria-label="Legal" className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Legal</p>
        <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block rounded-[6px] px-2.5 py-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))]"
              >
                {l.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article
        className={[
          'min-w-0 max-w-3xl text-[15px] leading-relaxed text-[hsl(var(--foreground))]',
          '[&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight',
          '[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold',
          '[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold',
          '[&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
          '[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
          '[&_a]:font-medium [&_a]:text-[hsl(var(--primary))] [&_a]:underline [&_a:hover]:no-underline',
          '[&_table]:mb-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
          '[&_th]:border-b [&_th]:border-[hsl(var(--border))] [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold',
          '[&_td]:border-b [&_td]:border-[hsl(var(--border))] [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top',
        ].join(' ')}
      >
        {children}
      </article>
    </div>
  )
}
