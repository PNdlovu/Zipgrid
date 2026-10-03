/**
 * @file PayoutAccountService.ts
 * @description Stripe Connect payout accounts for any user who earns money on
 * Zipgrid (hosts, property owners, residents). One Express account per user,
 * stored on users.stripe_connect_account_id (and mirrored onto the host
 * profile for hosts). Readiness is set by the account.updated webhook.
 *
 * @module domains/payments
 */

import { getDb } from '@/lib/db'
import { NotFoundError } from '@/lib/errors/AppError'
import { StripeService } from './StripeService'

export type PayoutAccountStatus = { accountId: string | null; payoutsEnabled: boolean }

function appUrl(): string {
  return process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
}

/** Only same-site relative paths are accepted as return destinations. */
function safePath(path: string | undefined, fallback: string): string {
  return path && /^\/(?![/\\])/.test(path) ? path : fallback
}

export const PayoutAccountService = {
  async getStatus(userId: string): Promise<PayoutAccountStatus> {
    const db = await getDb()
    const res = await db.execute(`SELECT stripe_connect_account_id, payouts_enabled FROM users WHERE id = $1`, [userId])
    const u = res.rows[0]
    if (!u) throw new NotFoundError('User', userId)
    return { accountId: (u['stripe_connect_account_id'] as string | null) ?? null, payoutsEnabled: Boolean(u['payouts_enabled']) }
  },

  /**
   * Returns a Stripe onboarding link, creating the Connect account on first use.
   * Retries reuse the same account (never creates duplicates).
   */
  async startOnboarding(
    userId: string,
    paths: { returnPath?: string; refreshPath?: string } = {},
  ): Promise<{ alreadyOnboarded: boolean; accountId: string; onboardingUrl: string | null }> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT email, stripe_connect_account_id, payouts_enabled FROM users WHERE id = $1`,
      [userId],
    )
    const u = res.rows[0]
    if (!u) throw new NotFoundError('User', userId)

    let accountId = u['stripe_connect_account_id'] as string | null
    if (accountId && u['payouts_enabled']) return { alreadyOnboarded: true, accountId, onboardingUrl: null }

    const returnUrl = `${appUrl()}${safePath(paths.returnPath, '/settings?payouts=success')}`
    const refreshUrl = `${appUrl()}${safePath(paths.refreshPath, '/settings?payouts=refresh')}`

    if (!accountId) {
      const created = await StripeService.createConnectAccount(u['email'] as string, returnUrl, refreshUrl)
      accountId = created.accountId
      // Persist immediately so a retry can never create a second account.
      await db.execute(
        `UPDATE users SET stripe_connect_account_id = $2, updated_at = NOW() WHERE id = $1 AND stripe_connect_account_id IS NULL`,
        [userId, accountId],
      )
      await db.execute(
        `UPDATE host_profiles SET stripe_connect_account_id = $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, accountId],
      )
      return { alreadyOnboarded: false, accountId, onboardingUrl: created.onboardingUrl }
    }

    const onboardingUrl = await StripeService.createAccountLink(accountId, returnUrl, refreshUrl)
    return { alreadyOnboarded: false, accountId, onboardingUrl }
  },

  /** Applies a Stripe account.updated event. */
  async onAccountUpdated(accountId: string, payoutsEnabled: boolean): Promise<void> {
    const db = await getDb()
    await db.execute(
      `UPDATE users SET payouts_enabled = $2, updated_at = NOW() WHERE stripe_connect_account_id = $1`,
      [accountId, payoutsEnabled],
    )
    await db.execute(
      `UPDATE host_profiles SET stripe_connect_onboarded = $2, payout_enabled = $2, updated_at = NOW()
       WHERE stripe_connect_account_id = $1`,
      [accountId, payoutsEnabled],
    )
  },
}
