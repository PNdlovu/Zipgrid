/**
 * @file page.tsx
 * @description /concierge — the AI charging concierge. Say or type what you
 * need ("get me charged near Leeds tomorrow at 9") and it finds, checks,
 * quotes and books. Bookings, cancellations and stops wait for a yes.
 * Also answers help questions (payments, cancellations, refunds).
 * ?ask= pre-fills a request (e.g. from the trip planner); the driver sends it.
 *
 * @module apps/web/app/(driver)/concierge
 */

'use client'

import { use } from 'react'
import Link from 'next/link'
import { ConciergeChat } from '@/components/concierge/ConciergeChat'

const SUGGESTIONS = [
  'Get me charged near here in the next hour',
  "I'm driving to Manchester tomorrow, sort my charging",
  'What bookings do I have coming up?',
  'How do card holds and refunds work?',
]

/** Driver concierge page. */
export default function ConciergePage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = use(searchParams)
  return (
    <ConciergeChat
      className="h-[calc(100dvh-4rem)]"
      title="Concierge"
      tagline="Tell me where you're going. I'll handle the charging."
      intro="Ask in your own words. I'll find a charger you can trust, check the price and book it once you say yes. I can also help with payments, cancellations and refunds."
      suggestions={SUGGESTIONS}
      placeholder="Where do you need to charge?"
      initialMessage={ask?.slice(0, 2000)}
      footer={<>Nothing is booked or charged until you confirm. <Link href="/bookings" className="underline">Your bookings</Link></>}
    />
  )
}
