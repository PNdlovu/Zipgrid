/**
 * @file route.ts
 * @description POST /api/v1/host/billing/change-plan
 * Creates a Stripe Checkout session for upgrading/downgrading an SMB plan.
 *
 * @module apps/web/api/v1/host/billing/change-plan
 */

import Stripe from 'stripe'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const PLAN_COMMISSION: Record<string, number> = {
  starter: 15.00,
  growth:  12.00,
  pro:     8.00,
}

// Monthly Stripe Price IDs must be set as env vars:
// STRIPE_PRICE_GROWTH_MONTHLY, STRIPE_PRICE_PRO_MONTHLY etc.
function getPriceId(tier: string): string | null {
  return process.env[`STRIPE_PRICE_${tier.toUpperCase()}_MONTHLY`] ?? null
}

const BodySchema = z.object({
  tier:   z.enum(['starter', 'growth', 'pro']),
  annual: z.boolean().default(false),
})

/** POST /api/v1/host/billing/change-plan — Creates a Stripe Checkout session for upgrading/downgrading an SMB plan. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof BodySchema>
  try { body = BodySchema.parse(await request.json()) }
  catch { return apiError('VALIDATION_ERROR', 'tier is required (starter|growth|pro)', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const hostRes = await db.execute(
      `SELECT hp.id, hp.platform_tier, u.stripe_customer_id
       FROM host_profiles hp JOIN users u ON u.id = hp.user_id
       WHERE hp.user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)

    const host = hostRes.rows[0] as {
      id: string; platform_tier: string; stripe_customer_id: string | null
    }

    // Free plan (starter) — no Stripe checkout needed, just update the DB
    if (body.tier === 'starter') {
      const newCommission = PLAN_COMMISSION['starter'] ?? 15.00
      await db.execute(
        `UPDATE host_profiles
         SET platform_tier = 'starter', commission_rate_pct = $2, updated_at = NOW()
         WHERE id = $1`,
        [host.id, newCommission],
      )
      const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? ''
      return apiResponse({ checkoutUrl: `${appUrl}/smb/billing?plan=starter&success=1` })
    }

    const priceId = getPriceId(body.tier)
    const appUrl  = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

    if (!priceId) {
      // Stripe Price IDs not configured — return a placeholder success URL
      // This prevents the UI from crashing in dev/staging
      return apiResponse({
        checkoutUrl: `${appUrl}/smb/billing?plan=${body.tier}&success=1&stripe_not_configured=1`,
      })
    }
    const stripe  = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', { apiVersion: '2024-06-20' })

    // Ensure customer exists
    let customerId = host.stripe_customer_id
    if (!customerId) {
      const userRes = await db.execute(`SELECT email, full_name FROM users WHERE id = $1`, [userId])
      const user = userRes.rows[0] as { email: string; full_name: string }
      const customer = await stripe.customers.create({ email: user.email, name: user.full_name })
      customerId = customer.id
      await db.execute(
        `UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1`,
        [userId, customerId],
      )
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/smb/billing?plan=${body.tier}&success=1`,
      cancel_url:  `${appUrl}/smb/billing?cancelled=1`,
      metadata:    { host_profile_id: host.id, tier: body.tier, platform: 'zipgrid' },
    })

    return apiResponse({ checkoutUrl: session.url })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[host/billing/change-plan]', err)
    return apiError('INTERNAL_ERROR', 'Could not create checkout session', 500)
  }
}
