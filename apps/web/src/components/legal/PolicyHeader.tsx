/**
 * @file PolicyHeader.tsx
 * @description Title block for a /legal policy page: title, version, last
 * updated date and the operator line, from policies.ts.
 *
 * @module components/legal
 */

import { POLICIES, type PolicyKey } from '@/domains/compliance/policies'

/** The company that operates Zipgrid. Fill in the registration details on incorporation. */
export const OPERATOR = {
  name: 'Zipgrid Ltd',
  jurisdiction: 'England and Wales',
  companyNumber: null as string | null,
  registeredAddress: null as string | null,
  icoRegistration: null as string | null,
  supportEmail: 'support@zipgrid.co.uk',
  privacyEmail: 'privacy@zipgrid.co.uk',
  securityEmail: 'security@zipgrid.co.uk',
}

/** One-line description of the operator, including registration details once set. */
export function operatorLine(): string {
  const parts = [`${OPERATOR.name}, a company registered in ${OPERATOR.jurisdiction}`]
  if (OPERATOR.companyNumber) parts.push(`company number ${OPERATOR.companyNumber}`)
  if (OPERATOR.registeredAddress) parts.push(`registered office ${OPERATOR.registeredAddress}`)
  return parts.join(', ')
}

/** Policy title with its version and last-updated date. */
export function PolicyHeader({ policy, summary }: { policy: PolicyKey; summary: string }) {
  const p = POLICIES[policy]
  return (
    <header className="mb-8 border-b border-[hsl(var(--border))] pb-6">
      <h1>{p.title}</h1>
      <p className="!mb-3 text-sm text-[hsl(var(--muted-foreground))]">
        Version {p.version} · Last updated {p.updated}
      </p>
      <p className="!mb-0 text-[hsl(var(--muted-foreground))]">{summary}</p>
    </header>
  )
}
