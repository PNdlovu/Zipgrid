/**
 * @file layout.tsx
 * @description Root layout — font loading, global CSS, providers, metadata.
 * Uses Inter variable font. Adds 'theme-ready' class after mount to
 * enable CSS transitions without FOUC.
 *
 * @module apps/web/app
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://zipgrid.co.uk'),
  title: {
    default: 'Zipgrid — EV Charging Made Easy',
    template: '%s | Zipgrid',
  },
  description:
    'Find affordable EV charging near you, or earn from your charger. AI-powered scheduling, real-time monitoring, and voice control.',
  keywords: ['EV charging', 'electric vehicle', 'home charger', 'charge at home', 'EV marketplace'],
  authors: [{ name: 'Zipgrid', url: 'https://zipgrid.co.uk' }],
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://zipgrid.co.uk',
    siteName: 'Zipgrid',
    title: 'Zipgrid — EV Charging Made Easy',
    description:
      'Find affordable EV charging near you, or earn from your charger.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Zipgrid — EV Charging Made Easy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zipgrid — EV Charging Made Easy',
    description: 'Find affordable EV charging near you, or earn from your charger.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

/**
 * Root layout — wraps every page.
 * @param props.children - Page content
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head />
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
