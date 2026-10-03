/**
 * @file page.tsx
 * @description /legal/security — how Zipgrid protects accounts, payments and
 * data, and how to report a vulnerability. Keep in step with the platform.
 *
 * @module apps/web/app/(marketing)/legal/security
 */

import type { Metadata } from 'next'
import { OPERATOR } from '@/components/legal/PolicyHeader'

export const metadata: Metadata = {
  title: 'Security — Zipgrid',
  description: 'How Zipgrid protects your account, payments and data, and how to report a security issue.',
  alternates: { canonical: 'https://zipgrid.co.uk/legal/security' },
}

/** Page at /legal/security — security overview and vulnerability reporting. */
export default function SecurityPage() {
  return (
    <>
      <header className="mb-8 border-b border-[hsl(var(--border))] pb-6">
        <h1>Security</h1>
        <p className="!mb-0 text-[hsl(var(--muted-foreground))]">How we protect your account, your payments and your data.</p>
      </header>

      <h2>Your account</h2>
      <ul>
        <li>Passwords are stored only as salted bcrypt hashes; we cannot read them.</li>
        <li>Sign-in uses short-lived tokens in secure, HTTP-only cookies, and refresh tokens are rotated on use.</li>
        <li>Sign-in, sign-up and verification codes are rate limited, and codes expire after 10 minutes and five wrong attempts.</li>
        <li>Changing your password signs out your other sessions.</li>
      </ul>

      <h2>Payments and identity</h2>
      <ul>
        <li>Card details go directly to Stripe, a PCI DSS Level 1 certified provider. Zipgrid never sees or stores full card numbers.</li>
        <li>Identity documents are checked by Stripe Identity; we keep only the result.</li>
        <li>Host payouts go to bank accounts verified by Stripe Connect.</li>
      </ul>

      <h2>Your data</h2>
      <ul>
        <li>All traffic is encrypted in transit with TLS, and our database is hosted in the EU with encryption at rest.</li>
        <li>Staff access to personal data is limited to what their role needs, and administrative actions are recorded in an audit log.</li>
        <li>Each booking has its own arrival code and session PIN, so a code from one booking cannot be reused.</li>
      </ul>

      <h2>Reporting a vulnerability</h2>
      <p>
        If you think you have found a security issue, email{' '}
        <a href={`mailto:${OPERATOR.securityEmail}`}>{OPERATOR.securityEmail}</a> with the details and steps to reproduce
        it. Please do not access other people&rsquo;s data, disrupt the service or make the issue public before we have
        fixed it. We will acknowledge your report within 2 business days and keep you updated.
      </p>
      <p>
        If you think someone has accessed your account, change your password and email us straight away.
      </p>
    </>
  )
}
