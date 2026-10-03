/**
 * @file page.tsx
 * @description /host/advisor — the concierge as a host's revenue advisor:
 * how each charger is doing against nearby chargers, what to change, and
 * (after the host's yes) price changes and booking approvals.
 *
 * @module apps/web/app/(host)/host/advisor
 */

'use client'

import Link from 'next/link'
import { ConciergeChat } from '@/components/concierge/ConciergeChat'

const SUGGESTIONS = [
  'How are my chargers doing this month?',
  'How can I earn more from my charger?',
  'Is my price right for my area?',
  'Do I have any bookings waiting for approval?',
]

/** Host revenue advisor page. */
export default function HostAdvisorPage() {
  return (
    <ConciergeChat
      className="h-[calc(100dvh-4rem)]"
      title="Revenue advisor"
      tagline="Earn more from the charger you already have."
      intro="I look at your bookings, earnings and reviews, compare your price and demand with chargers nearby, and suggest what to change. I'll only change a price or approve a booking after you say yes."
      suggestions={SUGGESTIONS}
      placeholder="Ask about your earnings, prices or bookings"
      footer={<>Prices and approvals only change when you confirm. <Link href="/host/listings" className="underline">Your listings</Link></>}
    />
  )
}
