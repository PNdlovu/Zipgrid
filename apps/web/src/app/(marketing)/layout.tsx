/**
 * @file layout.tsx
 * @description Shared layout for all marketing/public pages.
 * Wraps page content with Navbar + Footer.
 * All pages in this route group are public (no auth required).
 *
 * @module apps/web/app/(marketing)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'

/**
 * Marketing layout — Navbar + main content + Footer.
 * @param props.children - Page content
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))]">
      <Navbar />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
