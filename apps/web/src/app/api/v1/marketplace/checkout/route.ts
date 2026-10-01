/**
 * @file route.ts
 * @description POST /api/v1/marketplace/checkout
 * Stripe escrow hold for installer service bookings in the marketplace.
 *
 * Flow:
 *   1. Driver selects an installer service and submits a booking request
 *   2. A Stripe PaymentIntent is created with capture_method: 'manual'
 *   3. The booking is saved with status 'hold_placed'
 *   4. When the installer completes the job, the host/admin confirms
 *   5. /api/v1/marketplace/checkout/release captures the hold
 *   6. If cancelled before completion, /cancel releases the hold
 *
 * @module apps/web/api/v1/marketplace/checkout
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors/AppError'

const CheckoutSchema = z.object({
  /** Installer job / service product ID */
  installerJobId:  z.string().uuid().optional(),
  productId:       z.string().uuid().optional(),
  quantity:        z.number().int().min(1).max(10).default(1),
  /** Stripe Payment Method id (pm_xxx) already saved to customer */
  paymentMethodId: z.string().min(1),
  /** Optional requested service date */
  requestedDate:   z.string().optional(),
  /** Freetext job notes for the installer */
  notes:           z.string().max(1000).optional(),
}).refine((d) => d.installerJobId != null || d.productId != null, {
  message: 'Either installerJobId or productId is required',
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof CheckoutSchema>
  try {
    body = CheckoutSchema.parse(await request.json())
  } catch (err) {
    return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid request', 400)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const { StripeService } = await import('@/domains/payments/StripeService')
    const db = await getDb()

    // ── 1. Resolve price ─────────────────────────────────────────
    let amountPence = 0
    let description = 'Zipgrid marketplace service'
    let vendorConnectAccountId: string | null = null

    if (body.productId) {
      const productRes = await db.execute(
        `SELECT p.id, p.name, p.price_pence, vp.stripe_connect_account_id
         FROM products p
         JOIN vendor_profiles vp ON vp.id = p.vendor_id
         WHERE p.id = $1 AND p.is_active = TRUE LIMIT 1`,
        [body.productId],
      )
      if (productRes.rows.length === 0) throw new NotFoundError('Product', body.productId)
      const product = productRes.rows[0] as {
        id: string; name: string; price_pence: number; stripe_connect_account_id: string | null
      }
      amountPence = product.price_pence * body.quantity
      description = `${product.name} × ${body.quantity}`
      vendorConnectAccountId = product.stripe_connect_account_id
    } else if (body.installerJobId) {
      const jobRes = await db.execute(
        `SELECT ij.id, ij.title, ij.quote_pence, ip.stripe_connect_account_id
         FROM installer_jobs ij
         JOIN installer_profiles ip ON ip.id = ij.installer_id
         WHERE ij.id = $1 LIMIT 1`,
        [body.installerJobId],
      )
      if (jobRes.rows.length === 0) throw new NotFoundError('Installer job', body.installerJobId)
      const job = jobRes.rows[0] as {
        id: string; title: string; quote_pence: number; stripe_connect_account_id: string | null
      }
      amountPence = job.quote_pence
      description = job.title
      vendorConnectAccountId = job.stripe_connect_account_id
    }

    if (amountPence <= 0) {
      throw new ValidationError('Could not determine a valid price for this item')
    }

    // ── 2. Fetch buyer's Stripe customer id ──────────────────────
    const userRes = await db.execute(
      `SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (userRes.rows.length === 0) throw new NotFoundError('User', userId)
    const { stripe_customer_id: stripeCustomerId } = userRes.rows[0] as { stripe_customer_id: string | null }
    if (!stripeCustomerId) {
      throw new ValidationError('No payment account found. Please add a payment method first.', 'NO_STRIPE_CUSTOMER')
    }

    // ── 3. Create Stripe PaymentIntent (manual capture / escrow) ──
    const orderId = crypto.randomUUID()
    const { paymentIntentId, clientSecret, status } = await StripeService.createPaymentIntentHold({
      amountPence,
      stripeCustomerId,
      paymentMethodId: body.paymentMethodId,
      bookingId: orderId,   // reuse bookingId metadata field
      description,
    })

    // ── 4. Persist marketplace order ────────────────────────────
    await db.execute(
      `INSERT INTO orders (
         id, buyer_user_id, product_id, installer_job_id,
         quantity, unit_price_pence, total_pence,
         stripe_payment_intent_id, status,
         requested_date, notes,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'hold_placed',$9,$10,NOW(),NOW())`,
      [
        orderId,
        userId,
        body.productId ?? null,
        body.installerJobId ?? null,
        body.quantity,
        Math.round(amountPence / body.quantity),
        amountPence,
        paymentIntentId,
        body.requestedDate ?? null,
        body.notes ?? null,
      ],
    )

    return apiResponse({
      orderId,
      paymentIntentId,
      clientSecret,
      amountPence,
      status,
    }, 201)
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    }
    console.error('[marketplace/checkout]', err)
    return apiError('INTERNAL_ERROR', 'Checkout failed', 500)
  }
}
