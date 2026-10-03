/**
 * @file policies.ts
 * @description The platform's legal policies, published under /legal.
 * Bump a policy's `version` and `updated` when its wording changes materially:
 * acceptances are recorded per version (PolicyService), so earlier ones stay on record.
 *
 * @module domains/compliance
 */

export type PolicyKey = 'terms' | 'privacy' | 'host_terms' | 'driver_terms'

export const POLICIES: Record<PolicyKey, { title: string; version: string; updated: string; path: string }> = {
  terms:        { title: 'Terms of Service',                      version: '1.0', updated: '3 October 2026', path: '/legal/terms' },
  privacy:      { title: 'Privacy Policy',                        version: '1.0', updated: '3 October 2026', path: '/legal/privacy' },
  host_terms:   { title: 'Host Terms and Protection',             version: '1.0', updated: '3 October 2026', path: '/legal/host-terms' },
  driver_terms: { title: 'Driver Responsibilities and Liability', version: '1.0', updated: '3 October 2026', path: '/legal/driver-terms' },
}

/** The policies a new account accepts at sign-up, by role. */
export function policiesForRoles(roles: string[]): PolicyKey[] {
  const keys: PolicyKey[] = ['terms', 'privacy']
  if (roles.includes('driver')) keys.push('driver_terms')
  if (roles.includes('host')) keys.push('host_terms')
  return keys
}
