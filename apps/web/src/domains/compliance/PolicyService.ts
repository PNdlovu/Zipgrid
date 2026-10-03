/**
 * @file PolicyService.ts
 * @description Records which version of each legal policy (see policies.ts)
 * a user accepted, when and from where — evidence for disputes and claims.
 *
 * @module domains/compliance
 */

import { isIP } from 'node:net'
import { getDb, type Db } from '@/lib/db'
import { POLICIES, type PolicyKey } from './policies'

export { POLICIES, policiesForRoles, type PolicyKey } from './policies'

export type AcceptanceContext = { ip?: string | null; userAgent?: string | null }

export const PolicyService = {
  /** Records acceptance of the current version of each policy (idempotent per version). */
  async recordAcceptance(userId: string, keys: PolicyKey[], ctx: AcceptanceContext = {}, db?: Db): Promise<void> {
    const conn = db ?? (await getDb())
    const ip = ctx.ip && isIP(ctx.ip) ? ctx.ip : null
    for (const key of keys) {
      await conn.execute(
        `INSERT INTO policy_acceptances (user_id, policy, version, ip_address, user_agent)
         VALUES ($1, $2, $3, $4::inet, $5)
         ON CONFLICT (user_id, policy, version) DO NOTHING`,
        [userId, key, POLICIES[key].version, ip, ctx.userAgent?.slice(0, 500) ?? null],
      )
    }
  },

  /** The user's acceptances, newest first. */
  async listForUser(userId: string): Promise<{ policy: PolicyKey; version: string; acceptedAt: Date }[]> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT policy, version, accepted_at FROM policy_acceptances WHERE user_id = $1 ORDER BY accepted_at DESC`,
      [userId],
    )
    return res.rows.map((r) => ({
      policy: r['policy'] as PolicyKey,
      version: r['version'] as string,
      acceptedAt: new Date(r['accepted_at'] as string),
    }))
  },
}
