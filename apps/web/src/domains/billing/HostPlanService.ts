/**
 * @file HostPlanService.ts
 * @description Host plan lifecycle and enforcement.
 *
 * Source of truth: the host's Stripe subscription. syncSubscription() is the
 * only writer of host_profiles.platform_tier / commission_rate_pct, and is
 * driven by the Stripe webhooks (customer.subscription.*, checkout.session.completed).
 *
 * Plan changes (changePlan):
 *   - no subscription → paid tier: Stripe Checkout; the plan applies when the
 *     subscription becomes active (webhook)
 *   - paid → other paid tier or interval: price swapped immediately with proration
 *   - paid → Starter: cancelled at the end of the paid period; the host keeps
 *     the paid plan until then, then falls back to Starter
 * past_due keeps the paid plan while Stripe retries the card; canceled, unpaid
 * and incomplete_expired fall back to Starter.
 *
 * Enforcement: requireFeature() for gated features, assertCanAddListing() for
 * listing limits. Commission is snapshotted on each booking's transaction.
 *
 * @module domains/billing
 */

import type Stripe from 'stripe'
import { getDb, type Db } from '@/lib/db'
import { AppError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '@/lib/errors/AppError'
import { StripeService } from '@/domains/payments/StripeService'
import { StripeCustomer } from '@/domains/payments/StripeCustomer'
import {
  FEATURE_LABELS, PLANS, PLAN_LIST, isPlanTier, lowestPlanWith,
  type BillingInterval, type PlanFeature, type PlanTier,
} from '@/domains/billing/plans'

export type HostPlanStatus = {
  tier: PlanTier
  commissionPct: number
  status: string | null
  interval: BillingInterval | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  hasSubscription: boolean
}

export type ChangePlanResult =
  | { action: 'checkout'; checkoutUrl: string }
  | { action: 'updated'; tier: PlanTier }
  | { action: 'cancel_scheduled'; effectiveAt: Date | null }
  | { action: 'unchanged' }

/** Subscription states that keep the paid plan. */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due'])

/** Thrown when the host's plan does not include a feature or allowance (403 PLAN_UPGRADE_REQUIRED). */
export class PlanUpgradeRequiredError extends AppError {
  constructor(message: string) {
    super(message, 'PLAN_UPGRADE_REQUIRED', 403)
  }
}

/** Stripe Price id for a paid tier + interval, from STRIPE_PRICE_<TIER>_<MONTHLY|ANNUAL>. */
export function priceIdFor(tier: PlanTier, interval: BillingInterval): string | null {
  return process.env[`STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`] || null
}

/** Reverse lookup: which tier/interval a Stripe Price id belongs to. */
export function planForPrice(priceId: string): { tier: PlanTier; interval: BillingInterval } | null {
  for (const plan of PLAN_LIST) {
    for (const interval of ['monthly', 'annual'] as const) {
      if (plan.tier !== 'starter' && priceIdFor(plan.tier, interval) === priceId) return { tier: plan.tier, interval }
    }
  }
  return null
}

async function hostByUser(db: Db, userId: string): Promise<{ id: string; tier: PlanTier; subscriptionId: string | null; subscriptionStatus: string | null }> {
  const res = await db.execute(
    `SELECT id, platform_tier, stripe_subscription_id, subscription_status FROM host_profiles WHERE user_id = $1`,
    [userId],
  )
  const r = res.rows[0]
  if (!r) throw new NotFoundError('Host profile')
  return {
    id: r['id'] as string,
    tier: isPlanTier(r['platform_tier']) ? r['platform_tier'] : 'starter',
    subscriptionId: (r['stripe_subscription_id'] as string | null) ?? null,
    subscriptionStatus: (r['subscription_status'] as string | null) ?? null,
  }
}

export const HostPlanService = {
  async getStatus(userId: string): Promise<HostPlanStatus> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT platform_tier, commission_rate_pct, stripe_subscription_id, subscription_status,
              subscription_interval, subscription_current_period_end, subscription_cancel_at_period_end
       FROM host_profiles WHERE user_id = $1`,
      [userId],
    )
    const r = res.rows[0]
    if (!r) throw new NotFoundError('Host profile')
    const tier: PlanTier = isPlanTier(r['platform_tier']) ? r['platform_tier'] : 'starter'
    const interval = r['subscription_interval']
    return {
      tier,
      commissionPct: Number(r['commission_rate_pct'] ?? PLANS[tier].commissionPct),
      status: (r['subscription_status'] as string | null) ?? null,
      interval: interval === 'monthly' || interval === 'annual' ? interval : null,
      currentPeriodEnd: r['subscription_current_period_end'] ? new Date(r['subscription_current_period_end'] as string) : null,
      cancelAtPeriodEnd: Boolean(r['subscription_cancel_at_period_end']),
      hasSubscription: Boolean(r['stripe_subscription_id']),
    }
  },

  async changePlan(userId: string, tier: PlanTier, interval: BillingInterval, appUrl: string): Promise<ChangePlanResult> {
    const db = await getDb()
    const host = await hostByUser(db, userId)
    const live = host.subscriptionId && host.subscriptionStatus && ENTITLED_STATUSES.has(host.subscriptionStatus)

    if (tier === 'starter') {
      if (!live) {
        if (host.tier === 'starter') return { action: 'unchanged' }
        await this._applyTier(db, host.id, 'starter')
        return { action: 'updated', tier: 'starter' }
      }
      const sub = await StripeService.setCancelAtPeriodEnd(host.subscriptionId!, true)
      await this.syncSubscription(sub)
      return { action: 'cancel_scheduled', effectiveAt: periodEnd(sub) }
    }

    if (!StripeService.isConfigured()) throw new ServiceUnavailableError('Payments')
    const priceId = priceIdFor(tier, interval)
    if (!priceId) {
      throw new AppError(`The ${PLANS[tier].name} ${interval} plan is not available yet.`, 'PLAN_NOT_AVAILABLE', 503)
    }

    if (live) {
      const sub = await StripeService.changeSubscriptionPrice(host.subscriptionId!, priceId)
      await this.syncSubscription(sub)
      return { action: 'updated', tier }
    }

    const customerId = await StripeCustomer.getOrCreateId(userId)
    const checkoutUrl = await StripeService.createSubscriptionCheckout({
      stripeCustomerId: customerId,
      priceId,
      successUrl: `${appUrl}/smb/billing?checkout=success`,
      cancelUrl: `${appUrl}/smb/billing?checkout=cancelled`,
      metadata: { host_profile_id: host.id, tier, interval, platform: 'zipgrid' },
    })
    return { action: 'checkout', checkoutUrl }
  },

  /** Withdraws a scheduled cancellation (host changed their mind before period end). */
  async resume(userId: string): Promise<void> {
    const db = await getDb()
    const host = await hostByUser(db, userId)
    if (!host.subscriptionId) throw new AppError('There is no subscription to resume.', 'NO_SUBSCRIPTION', 409)
    await this.syncSubscription(await StripeService.setCancelAtPeriodEnd(host.subscriptionId, false))
  },

  /**
   * Applies Stripe subscription state to the host (idempotent; safe for webhook
   * redelivery). Returns false when the subscription can't be matched to a host.
   */
  async syncSubscription(sub: Stripe.Subscription): Promise<boolean> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id FROM host_profiles WHERE stripe_subscription_id = $1 OR id::text = $2 LIMIT 1`,
      [sub.id, sub.metadata?.['host_profile_id'] ?? ''],
    )
    const hostId = res.rows[0]?.['id'] as string | undefined
    if (!hostId) return false

    const priceId = sub.items.data[0]?.price.id ?? ''
    const plan = planForPrice(priceId)
    const entitled = ENTITLED_STATUSES.has(sub.status) && plan !== null
    const tier: PlanTier = entitled ? plan.tier : 'starter'
    const ended = sub.status === 'canceled' || sub.status === 'incomplete_expired'

    await db.execute(
      `UPDATE host_profiles
       SET stripe_subscription_id = $2, subscription_status = $3, subscription_interval = $4,
           subscription_current_period_end = $5, subscription_cancel_at_period_end = $6,
           platform_tier = $7, commission_rate_pct = $8, updated_at = NOW()
       WHERE id = $1`,
      [
        hostId,
        ended ? null : sub.id,
        sub.status,
        plan?.interval ?? null,
        periodEnd(sub)?.toISOString() ?? null,
        Boolean(sub.cancel_at_period_end),
        tier,
        PLANS[tier].commissionPct,
      ],
    )
    return true
  },

  async _applyTier(db: Db, hostProfileId: string, tier: PlanTier): Promise<void> {
    await db.execute(
      `UPDATE host_profiles SET platform_tier = $2, commission_rate_pct = $3, updated_at = NOW() WHERE id = $1`,
      [hostProfileId, tier, PLANS[tier].commissionPct],
    )
  },

  /**
   * Ensures the caller's host plan includes a feature.
   * @throws {PlanUpgradeRequiredError} when it does not
   */
  async requireFeature(userId: string, feature: PlanFeature): Promise<void> {
    const db = await getDb()
    const res = await db.execute(`SELECT platform_tier FROM host_profiles WHERE user_id = $1`, [userId])
    const raw = res.rows[0]?.['platform_tier']
    if (raw === undefined) throw new ForbiddenError('A host profile is required.')
    const tier: PlanTier = isPlanTier(raw) ? raw : 'starter'
    if (PLANS[tier].features.includes(feature)) return
    const needed = lowestPlanWith(feature)
    throw new PlanUpgradeRequiredError(
      `${FEATURE_LABELS[feature]} is included in the ${needed.name} plan. Upgrade in Billing to use it.`,
    )
  },

  /**
   * Ensures the host can add another listing under their plan.
   * @throws {PlanUpgradeRequiredError} at the plan's listing limit
   */
  async assertCanAddListing(hostProfileId: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT hp.platform_tier,
              (SELECT COUNT(*) FROM charger_listings cl
               WHERE cl.host_profile_id = hp.id AND cl.status <> 'deactivated')::INT AS listings
       FROM host_profiles hp WHERE hp.id = $1`,
      [hostProfileId],
    )
    const r = res.rows[0]
    if (!r) throw new NotFoundError('Host profile', hostProfileId)
    const plan = PLANS[isPlanTier(r['platform_tier']) ? r['platform_tier'] : 'starter']
    if (plan.maxListings !== null && Number(r['listings']) >= plan.maxListings) {
      const next = PLAN_LIST.find((p) => p.rank > plan.rank)
      throw new PlanUpgradeRequiredError(
        `The ${plan.name} plan includes up to ${plan.maxListings} listings.` +
          (next ? ` Upgrade to ${next.name} to add more.` : ''),
      )
    }
  },
}

/** End of the current billing period (field location differs across Stripe API versions). */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const s = sub as unknown as { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } }
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000) : null
}
