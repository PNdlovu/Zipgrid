/**
 * @file page.tsx
 * @description /legal/accessibility — accessibility statement for the web app.
 *
 * @module apps/web/app/(marketing)/legal/accessibility
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { OPERATOR } from '@/components/legal/PolicyHeader'

export const metadata: Metadata = {
  title: 'Accessibility — Zipgrid',
  description: 'Zipgrid’s commitment to accessibility, how to get help and how to report a problem.',
  alternates: { canonical: 'https://zipgrid.co.uk/legal/accessibility' },
}

/** Page at /legal/accessibility — accessibility statement. */
export default function AccessibilityPage() {
  return (
    <>
      <header className="mb-8 border-b border-[hsl(var(--border))] pb-6">
        <h1>Accessibility</h1>
        <p className="!mb-0 text-[hsl(var(--muted-foreground))]">We want everyone to be able to find, book and host a charger.</p>
      </header>

      <h2>Our aim</h2>
      <p>
        We design Zipgrid to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. The site works with
        keyboard navigation and screen readers, supports browser zoom up to 200%, follows your device&rsquo;s light or dark
        setting, and listings can show accessibility details such as step-free access and parking bay width.
      </p>

      <h2>Known limitations</h2>
      <ul>
        <li>The map is hard to use with a screen reader. Use the <Link href="/listings">charger list</Link> to search and book instead.</li>
        <li>Some photos uploaded by hosts may not have descriptions.</li>
      </ul>

      <h2>Getting help or reporting a problem</h2>
      <p>
        If something on Zipgrid is hard to use, or you need information in a different format, email{' '}
        <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>. Tell us the page and what went wrong,
        and we will reply within 5 business days.
      </p>
      <p>
        If you are not happy with our response, you can contact the Equality Advisory and Support Service (EASS) at{' '}
        <a href="https://www.equalityadvisoryservice.com/" rel="noopener noreferrer">equalityadvisoryservice.com</a>.
      </p>
    </>
  )
}
