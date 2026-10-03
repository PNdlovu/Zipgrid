/**
 * @file page.tsx
 * @description /legal/terms — Terms of Service. Every statement must match
 * what the platform does (bookings, holds, wallet, disputes, damage recovery).
 * Version and date: domains/compliance/policies.ts.
 *
 * @module apps/web/app/(marketing)/legal/terms
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { OPERATOR, PolicyHeader, operatorLine } from '@/components/legal/PolicyHeader'
import { PLANS } from '@/domains/billing/plans'
import { MIN_PAYOUT_PENCE } from '@/domains/payments/PayoutService'

export const metadata: Metadata = {
  title: 'Terms of Service — Zipgrid',
  description: 'The agreement between you and Zipgrid for booking, hosting and paying for EV charging.',
  alternates: { canonical: 'https://zipgrid.co.uk/legal/terms' },
}

const commissionRange = (() => {
  const pcts = Object.values(PLANS).map((p) => p.commissionPct)
  return `${Math.min(...pcts)}% to ${Math.max(...pcts)}%`
})()

/** Page at /legal/terms — Terms of Service. */
export default function TermsPage() {
  return (
    <>
      <PolicyHeader
        policy="terms"
        summary="The agreement between you and Zipgrid when you book, host or pay for EV charging through our website and apps."
      />

      <h2>1. Who we are</h2>
      <p>
        Zipgrid is operated by {operatorLine()} (&ldquo;Zipgrid&rdquo;, &ldquo;we&rdquo;). Zipgrid is an online
        marketplace: we connect people who share an electric vehicle charger (&ldquo;hosts&rdquo;) with people who want
        to charge (&ldquo;drivers&rdquo;), and we take payments on their behalf. We do not own or operate the chargers,
        we are not an energy supplier or electrical contractor, and we do not provide insurance.
      </p>
      <p>
        These terms, together with our <Link href="/legal/privacy">Privacy Policy</Link>, the{' '}
        <Link href="/legal/driver-terms">Driver Responsibilities</Link> (if you drive) and the{' '}
        <Link href="/legal/host-terms">Host Terms</Link> (if you host), form the agreement between you and Zipgrid. If
        they conflict, the driver or host terms apply to that role.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or over and able to enter a contract. One account per person.</li>
        <li>Give accurate details and keep them up to date. Drivers and hosts verify their identity (through Stripe Identity) before booking or listing.</li>
        <li>Keep your password secure and tell us at <a href={`mailto:${OPERATOR.securityEmail}`}>{OPERATOR.securityEmail}</a> straight away if you think someone else has used your account. You are responsible for activity on your account that results from not keeping it secure.</li>
      </ul>

      <h2>3. Bookings</h2>
      <ul>
        <li>A confirmed booking is an agreement between the driver and the host for the use of the charger during the booked time. Zipgrid arranges it and takes payment, but is not a party to it.</li>
        <li>Some listings confirm instantly; others need the host to approve the request.</li>
        <li>Each booking has its own arrival code and session PIN. Only use the charger, and only enter the host&rsquo;s property, during your booked time.</li>
        <li>The driver can cancel at no charge before the session starts; any card hold or wallet reservation is released in full. If the host cancels, the driver is not charged.</li>
      </ul>

      <h2>4. Prices and payment</h2>
      <ul>
        <li>The host sets the price (per kWh, per hour or per session), any peak-time surcharge and any idle fee for staying connected after charging finishes. You see the price before you book.</li>
        <li>When you book we place a hold on your card, or reserve the amount in your Zipgrid wallet. For bookings more than 6 days ahead the hold is placed 24 hours before the start. After the session we charge the actual cost and release the rest.</li>
        <li>If a session costs more than the hold, the host is still paid in full and we collect the difference from your wallet or saved card. Until an outstanding balance is paid you cannot make new bookings.</li>
        <li>Card payments are processed by Stripe. We never see or store your full card number.</li>
        <li>Wallet top-ups can be refunded to the card they came from when you close your account. Promotional and reward credit has no cash value.</li>
      </ul>

      <h2>5. Fees and payouts for hosts</h2>
      <ul>
        <li>Drivers pay the price shown; Zipgrid&rsquo;s commission ({commissionRange}, depending on the host&rsquo;s plan) is deducted from the host&rsquo;s earnings. Paid plans are billed monthly through Stripe and can be cancelled at any time from Billing.</li>
        <li>Earnings are paid weekly to the host&rsquo;s verified bank account through Stripe Connect once they reach £{(MIN_PAYOUT_PENCE / 100).toFixed(2)}.</li>
        <li>Hosts are responsible for their own tax, including declaring earnings to HMRC and any VAT.</li>
      </ul>

      <h2>6. When something goes wrong</h2>
      <p>
        If anyone is hurt or in danger, call 999 first. Then report it in the{' '}
        <Link href="/help/resolution">Resolution Centre</Link>. Drivers and hosts can both open a case on a booking; the
        other person is told and can give their side. We acknowledge safety problems within 1 hour and other cases within
        24 hours, and review the evidence from both sides together with the booking and charging-session record. We aim to
        decide most cases within 5 business days and damage claims within 10. Either side can appeal a decision within 14 days by emailing {OPERATOR.supportEmail} with the case number.
      </p>
      <p>
        Outcomes can include a refund to the driver, a charge to the driver for damage they caused (see the{' '}
        <Link href="/legal/driver-terms">Driver Responsibilities</Link>), a warning, or suspending an account. Using the
        Resolution Centre does not stop either of you going to court or using your statutory rights.
      </p>

      <h2>7. Rules for everyone</h2>
      <ul>
        <li>Do not break the law, harass or threaten anyone, or give false information.</li>
        <li>Do not arrange bookings or payments outside Zipgrid to avoid fees.</li>
        <li>Do not tamper with chargers, bypass safety features or use someone else&rsquo;s arrival code.</li>
        <li>Reviews must be honest and about your own booking.</li>
        <li>Do not scrape, reverse-engineer or overload the platform.</li>
      </ul>
      <p>
        We may suspend or close an account that breaks these terms or puts other people at risk. We will tell you why and
        how to appeal, unless the law or a safety concern prevents us.
      </p>

      <h2>8. Our responsibility to you</h2>
      <ul>
        <li>We provide the platform with reasonable care and skill, as the Consumer Rights Act 2015 requires. Nothing in these terms affects your statutory rights.</li>
        <li>Chargers belong to hosts, so we cannot promise a charger will work, suit your vehicle or be available. If it fails, report it in the Resolution Centre and we refund you for what you could not use.</li>
        <li>We are not responsible for losses we could not reasonably foresee, for business losses, or for what hosts and drivers do, except where we caused the loss by breaking these terms or acting negligently.</li>
        <li>Nothing limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to limit.</li>
      </ul>

      <h2>9. Changes and ending the agreement</h2>
      <ul>
        <li>We will email you at least 30 days before a material change to these terms takes effect. If you do not agree, you can close your account before then.</li>
        <li>You can close your account at any time from Settings. Closure takes effect after a 14-day cooling-off period, once any open bookings, cases and balances are settled. Records we must keep by law (such as payment records, for 7 years) are retained.</li>
      </ul>

      <h2>10. Law and contact</h2>
      <p>
        These terms are governed by the law of England and Wales. If you live in Scotland or Northern Ireland you can also
        bring proceedings in your local courts. Questions: <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>.
      </p>
    </>
  )
}
