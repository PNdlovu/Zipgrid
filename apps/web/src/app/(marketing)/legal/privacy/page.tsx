/**
 * @file page.tsx
 * @description /legal/privacy — Privacy Policy (UK GDPR / Data Protection Act
 * 2018). The processor list must match the services the platform actually
 * calls; update it when one is added or removed.
 *
 * @module apps/web/app/(marketing)/legal/privacy
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { OPERATOR, PolicyHeader, operatorLine } from '@/components/legal/PolicyHeader'

export const metadata: Metadata = {
  title: 'Privacy Policy — Zipgrid',
  description: 'What personal data Zipgrid collects, why, who we share it with, how long we keep it and your rights.',
  alternates: { canonical: 'https://zipgrid.co.uk/legal/privacy' },
}

const COLLECTED = [
  ['Account details', 'Name, email, phone number, password (stored hashed), roles', 'Running your account', 'Contract'],
  ['Identity verification', 'ID document and selfie checks, handled by Stripe Identity; we keep only the result', 'Keeping drivers and hosts safe; preventing fraud', 'Legitimate interests; legal obligation'],
  ['Vehicles', 'Make, model, registration, connector type, battery size', 'Matching chargers; identifying who used a charger', 'Contract'],
  ['Chargers and listings', 'Address and location, photos, charger details, safety checklist, availability', 'Publishing listings; safety scoring', 'Contract; legitimate interests'],
  ['Bookings and sessions', 'Times, arrival codes used, energy, power, charger fault codes', 'Billing; resolving problems; safety', 'Contract; legitimate interests'],
  ['Payments and payouts', 'Stripe customer and payment references, last four card digits, wallet history, bank details for payouts (held by Stripe)', 'Taking payments and paying hosts; tax records', 'Contract; legal obligation'],
  ['Cases and evidence', 'Resolution Centre reports, photos, video and documents, decisions', 'Handling disputes and damage claims', 'Contract; legitimate interests'],
  ['Policy acceptances', 'Which version of our terms you accepted, when, and the IP address used', 'Showing what was agreed', 'Legitimate interests'],
  ['Location', 'Your location when you search or navigate, if you allow it', 'Finding nearby chargers', 'Consent (device setting)'],
  ['Concierge', 'What you ask the AI concierge and its replies', 'Answering your questions', 'Contract'],
  ['Device and security', 'IP address, browser and device type, sign-in history', 'Security, fraud and abuse prevention', 'Legitimate interests'],
  ['Messages from us', 'Notification and marketing preferences', 'Sending service messages; marketing only if you opt in', 'Contract; consent for marketing'],
]

const PROCESSORS = [
  ['Stripe', 'Card payments, wallet top-ups, host payouts (Stripe Connect), identity verification', 'UK, EU, US'],
  ['Railway', 'Application hosting and database', 'EU (Netherlands)'],
  ['Resend', 'Sending emails', 'US'],
  ['Twilio', 'Sending text messages', 'US'],
  ['Anthropic', 'The AI concierge', 'US'],
  ['Mapbox', 'Maps, search and directions', 'US'],
  ['Upstash', 'Rate limiting to prevent abuse (IP addresses)', 'EU or US'],
  ['Sentry', 'Error monitoring (may include your user ID)', 'US'],
]

const RETENTION = [
  ['Account details', 'While your account is open, then deleted or anonymised after closure'],
  ['Payment, payout and tax records', '7 years (HMRC requirement)'],
  ['Booking and session records', '7 years where they form part of payment records; otherwise 2 years'],
  ['Resolution Centre cases and evidence', '6 years after the case closes (the period for legal claims)'],
  ['Identity verification result', 'While your account is open and 5 years after (fraud prevention)'],
  ['Policy acceptances and audit logs', '7 years'],
  ['Concierge conversations', 'Until you delete them or close your account'],
  ['Marketing preferences', 'Until you change them'],
]

/** Page at /legal/privacy — Privacy Policy. */
export default function PrivacyPage() {
  return (
    <>
      <PolicyHeader
        policy="privacy"
        summary="What personal data we collect when you use Zipgrid, why we use it, who we share it with, how long we keep it and the rights you have."
      />

      <h2>1. Who is responsible for your data</h2>
      <p>
        {operatorLine()} is the controller of your personal data
        {OPERATOR.icoRegistration ? `, registered with the Information Commissioner’s Office under number ${OPERATOR.icoRegistration}` : ''}.
        Contact us about privacy at <a href={`mailto:${OPERATOR.privacyEmail}`}>{OPERATOR.privacyEmail}</a>.
      </p>

      <h2>2. What we collect and why</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Data</th><th>Examples</th><th>Why</th><th>Lawful basis</th></tr>
          </thead>
          <tbody>
            {COLLECTED.map(([data, examples, why, basis]) => (
              <tr key={data}><td>{data}</td><td>{examples}</td><td>{why}</td><td>{basis}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>We never sell your personal data.</p>

      <h2>3. What other users see</h2>
      <ul>
        <li>Drivers see a host&rsquo;s first name, the charger&rsquo;s location and, once booked, access instructions.</li>
        <li>Hosts see a booking driver&rsquo;s first name, vehicle and booking times.</li>
        <li>If a case is opened about a booking, both people see the case and the evidence added to it.</li>
        <li>Reviews you write are shown with your first name.</li>
      </ul>

      <h2>4. Who we share data with</h2>
      <p>We use these service providers, who process data on our instructions under contract:</p>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Provider</th><th>Purpose</th><th>Where</th></tr></thead>
          <tbody>
            {PROCESSORS.map(([name, purpose, where]) => (
              <tr key={name}><td>{name}</td><td>{purpose}</td><td>{where}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        We also share data when the law requires it (for example with HMRC or the police under a valid request), with a
        host&rsquo;s or driver&rsquo;s insurer when they are handling a claim about a booking, and with a buyer if Zipgrid
        is sold, who must keep this policy.
      </p>

      <h2>5. Transfers outside the UK</h2>
      <p>
        Where a provider processes data outside the UK, the transfer is covered by UK adequacy regulations (including the
        UK Extension to the EU-US Data Privacy Framework) or the UK International Data Transfer Addendum to the EU
        Standard Contractual Clauses.
      </p>

      <h2>6. How long we keep data</h2>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
          <tbody>
            {RETENTION.map(([data, period]) => <tr key={data}><td>{data}</td><td>{period}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2>7. Your rights</h2>
      <ul>
        <li><strong>Access and portability:</strong> download your data from Settings → Privacy, or email us.</li>
        <li><strong>Correction:</strong> edit your profile, or ask us to correct anything else.</li>
        <li><strong>Deletion:</strong> close your account from Settings. Deletion happens after a 14-day cooling-off period; records we must keep by law are kept for the periods above.</li>
        <li><strong>Objection and restriction:</strong> object to processing based on legitimate interests, or ask us to restrict it.</li>
        <li><strong>Withdraw consent:</strong> change marketing or location permissions at any time.</li>
      </ul>
      <p>
        We reply within one month. If you are unhappy with how we handle your data you can complain to the Information
        Commissioner&rsquo;s Office at <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer">ico.org.uk</a> or
        on 0303 123 1113.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use only essential cookies: two secure sign-in cookies that keep you logged in. We do not use advertising or
        cross-site tracking cookies. Your theme choice is stored on your device. If we add analytics, we will ask for your
        consent first.
      </p>

      <h2>9. Security and children</h2>
      <p>
        See <Link href="/legal/security">Security</Link> for how we protect your data. Zipgrid is for people aged 18 and
        over and we do not knowingly collect data from children.
      </p>

      <h2>10. Changes</h2>
      <p>We will email you before a material change to this policy takes effect.</p>
    </>
  )
}
