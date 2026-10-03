/**
 * @file plans.ts
 * @description Host subscription plans — the single definition used by the
 * billing UI, plan enforcement and commission. Pure data (safe for client code).
 *
 * Prices are set in Stripe; the env vars STRIPE_PRICE_<TIER>_<MONTHLY|ANNUAL>
 * hold the Stripe Price ids. The pence amounts here are for display only.
 *
 * @module domains/billing
 */

export type PlanTier = 'starter' | 'growth' | 'pro'
export type BillingInterval = 'monthly' | 'annual'

/** Features gated by plan (enforced server-side by HostPlanService.requireFeature). */
export type PlanFeature =
  | 'analytics'          // revenue analytics + heatmap
  | 'data_export'        // CSV/XLSX export
  | 'qr_access'          // QR-code customer access rules
  | 'access_control'     // email / domain allow-lists, open access rules
  | 'webhooks'           // webhook API subscriptions
  | 'vat_invoices'       // VAT invoice generation

export type Plan = {
  tier: PlanTier
  name: string
  /** Rank for upgrade/downgrade comparisons. */
  rank: number
  monthlyPence: number
  annualPence: number
  /** Platform commission charged on this host's sessions, in percent. */
  commissionPct: number
  /** Maximum live (non-deactivated) listings; null = unlimited. */
  maxListings: number | null
  features: PlanFeature[]
  /** Marketing bullets shown on the billing page. */
  highlights: string[]
}

export const PLANS: Record<PlanTier, Plan> = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    rank: 0,
    monthlyPence: 0,
    annualPence: 0,
    commissionPct: 15,
    maxListings: 3,
    features: [],
    highlights: ['Up to 3 charger listings', '15% platform commission', 'Earnings dashboard', 'AI revenue advisor'],
  },
  growth: {
    tier: 'growth',
    name: 'Growth',
    rank: 1,
    monthlyPence: 2900,
    annualPence: 28_900, // ≈17% off 12 × £29
    commissionPct: 12,
    maxListings: 10,
    features: ['analytics', 'data_export', 'qr_access'],
    highlights: [
      'Up to 10 charger listings',
      '12% platform commission',
      'Revenue analytics + heatmap',
      'CSV / XLSX data export',
      'QR code customer access',
    ],
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    rank: 2,
    monthlyPence: 7900,
    annualPence: 75_800, // 20% off 12 × £79
    commissionPct: 8,
    maxListings: null,
    features: ['analytics', 'data_export', 'qr_access', 'access_control', 'webhooks', 'vat_invoices'],
    highlights: [
      'Unlimited charger listings',
      '8% platform commission',
      'Everything in Growth',
      'Webhook API access',
      'VAT invoice generation',
      'Custom access controls & allow-lists',
    ],
  },
}

export const PLAN_LIST: Plan[] = [PLANS.starter, PLANS.growth, PLANS.pro]

/** Feature labels for upgrade prompts. */
export const FEATURE_LABELS: Record<PlanFeature, string> = {
  analytics: 'Revenue analytics',
  data_export: 'Data export',
  qr_access: 'QR code access',
  access_control: 'Custom access controls',
  webhooks: 'Webhook API',
  vat_invoices: 'VAT invoices',
}

/** The cheapest plan that includes a feature. */
export function lowestPlanWith(feature: PlanFeature): Plan {
  return PLAN_LIST.find((p) => p.features.includes(feature)) ?? PLANS.pro
}

/** Type guard for plan tier strings. */
export function isPlanTier(v: unknown): v is PlanTier {
  return v === 'starter' || v === 'growth' || v === 'pro'
}
