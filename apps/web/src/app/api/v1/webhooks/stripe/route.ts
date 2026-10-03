/**
 * @file route.ts
 * @description POST /api/v1/webhooks/stripe
 * Handles Stripe webhook events. Verifies signature, deduplicates on
 * stripe_webhook_events table, then dispatches to per-event handlers.
 *
 * Events handled:
 *   payment_intent.amount_capturable_updated — PI authorized, hold confirmed
 *   payment_intent.succeeded                 — PI captured successfully
 *   payment_intent.payment_failed            — authorization or capture failed
 *   payment_intent.canceled                  — PI canceled (booking canceled)
 *   charge.refunded                          — refund processed
 *   charge.dispute.created                   — chargeback initiated
 *   payout.paid                              — Stripe payout landed in host bank
 *   payout.failed                            — Stripe payout failed
 *   account.updated                          — Stripe Connect account state changed
 *
 * Security: raw body required for signature verification.
 * Next.js does not parse the body before this handler receives it.
 *
 * @module apps/web/api/v1/webhooks/stripe
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { StripeService } from '@/domains/payments/StripeService'
import { eventBus } from '@/lib/events/event-bus'
import { transaction } from '@/lib/db'
import { EarningsAllocator } from '@/domains/payments/EarningsAllocator'
import { PayoutAccountService } from '@/domains/payments/PayoutAccountService'
import { ShortfallService } from '@/domains/payments/ShortfallService'

/* ── Helpers ────────────────────────────────────────────────── */

async function getDb() {
  const { getDb: _getDb } = await import('@/lib/db')
  return _getDb()
}

/**
 * Claims an event for processing. Returns false when it was already claimed.
 * Database errors propagate (→ 500 → Stripe retries) rather than being
 * mistaken for duplicates.
 */
async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  const db = await getDb()
  const res = await db.execute(
    `INSERT INTO stripe_webhook_events (id, event_type) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [eventId, eventType],
  )
  return res.rows.length > 0
}

/** Releases a claim so Stripe's retry of a failed event is processed again. */
async function releaseEvent(eventId: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM stripe_webhook_events WHERE id = $1`, [eventId])
}

/* ── Event handlers ─────────────────────────────────────────── */

/** payment_intent.amount_capturable_updated — hold is live */
async function handleHoldConfirmed(pi: Stripe.PaymentIntent) {
  const db = await getDb()
  await db.execute(
    `UPDATE transactions
     SET status = 'hold_placed', hold_placed_at = NOW(), updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [pi.id],
  )
}

/**
 * payment_intent.succeeded
 *   - wallet top-up (manual or auto) → credit the wallet (idempotent per
 *     PaymentIntent), then clear any outstanding session balance from it
 *   - shortfall recovery charge → mark the shortfall collected
 *   - charging hold captured outside Zipgrid (e.g. Stripe dashboard) →
 *     reconcile the transaction. Captures made by SettlementService are
 *     already recorded, so this is a no-op for them.
 */
async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  if (pi.metadata?.['purpose'] === 'wallet_topup' && pi.metadata['user_id']) {
    const { WalletService } = await import('@/domains/payments/WalletService')
    await WalletService.topUp(pi.metadata['user_id'], pi.amount_received, pi.id)
    await ShortfallService.collectFromWallet(pi.metadata['user_id'])
    return
  }
  if (pi.metadata?.['purpose'] === 'shortfall' && pi.metadata['shortfall_id']) {
    await ShortfallService.applyCardPayment(pi.metadata['shortfall_id'], pi.amount_received, pi.id)
    return
  }

  const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge?.id ?? null)
  const reconciled = await transaction(async (tx) => {
    const res = await tx.execute(
      `SELECT t.id, t.commission_rate_pct, dp.user_id AS driver_user
       FROM transactions t
       JOIN bookings b ON b.id = t.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE t.stripe_payment_intent_id = $1 AND t.status = 'hold_placed'
       FOR UPDATE OF t`,
      [pi.id],
    )
    const t = res.rows[0]
    if (!t) return null
    const total = pi.amount_received
    const fee = Math.round((total * Number(t['commission_rate_pct'] ?? 15)) / 100)
    await tx.execute(
      `UPDATE transactions
       SET status = 'captured', total_charged_cents = $2, platform_fee_cents = $3,
           host_earnings_cents = $4, stripe_charge_id = $5, captured_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [t['id'], total, fee, total - fee, chargeId],
    )
    await EarningsAllocator.allocateCapture(tx, t['id'] as string, total - fee)
    await tx.execute(
      `UPDATE bookings b SET status = 'completed', completed_at = COALESCE(b.completed_at, NOW()), updated_at = NOW()
       FROM transactions t WHERE t.id = $1 AND t.booking_id = b.id AND b.status IN ('confirmed', 'active')`,
      [t['id']],
    )
    return { transactionId: t['id'] as string, driverId: t['driver_user'] as string, amount: total }
  })

  if (reconciled) {
    eventBus.publish({
      type: 'PAYMENT_CAPTURED',
      transactionId: reconciled.transactionId,
      amountPence: reconciled.amount,
      driverId: reconciled.driverId,
    })
  } else if (chargeId) {
    const db = await getDb()
    await db.execute(
      `UPDATE transactions SET stripe_charge_id = COALESCE(stripe_charge_id, $2), updated_at = NOW()
       WHERE stripe_payment_intent_id = $1`,
      [pi.id, chargeId],
    )
  }
}

/** payment_intent.payment_failed — authorization or capture failed */
async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const db = await getDb()
  await db.execute(
    `UPDATE transactions
     SET status = 'failed', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [pi.id],
  )
  // Cancel booking if still in pending/confirmed state
  await db.execute(
    `UPDATE bookings b
     SET status = 'cancelled_by_platform',
         cancelled_at = NOW(),
         cancellation_note = 'Payment authorization failed',
         updated_at = NOW()
     FROM transactions t
     WHERE t.stripe_payment_intent_id = $1 AND t.booking_id = b.id
       AND b.status IN ('pending','confirmed')`,
    [pi.id],
  )
}

/** payment_intent.canceled — driver canceled before session */
async function handlePaymentCanceled(pi: Stripe.PaymentIntent) {
  const db = await getDb()
  await db.execute(
    `UPDATE transactions
     SET status = 'fully_refunded', updated_at = NOW()
     WHERE stripe_payment_intent_id = $1 AND status = 'hold_placed'`,
    [pi.id],
  )
}

/** charge.refunded — partial or full refund landed */
async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.payment_intent) return
  const piId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id
  const totalRefunded = charge.amount_refunded
  const isFullRefund = charge.refunded

  await transaction(async (tx) => {
    const res = await tx.execute(
      `SELECT id, COALESCE(refunded_cents, 0) AS refunded, commission_rate_pct
       FROM transactions WHERE stripe_payment_intent_id = $1 FOR UPDATE`,
      [piId],
    )
    const t = res.rows[0]
    if (!t) return // not a charging transaction (e.g. marketplace order)
    const delta = totalRefunded - Number(t['refunded'])
    await tx.execute(
      `UPDATE transactions
       SET status = $2, refunded_cents = $3, refunded_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [t['id'], isFullRefund ? 'fully_refunded' : 'partially_refunded', totalRefunded],
    )
    // Refunds issued outside Zipgrid (e.g. Stripe dashboard) still reduce earnings.
    if (delta > 0) {
      const feeRate = Number(t['commission_rate_pct'] ?? 15) / 100
      await EarningsAllocator.allocateRefund(tx, t['id'] as string, Math.round(delta * (1 - feeRate)), `stripe_refund:${totalRefunded}`)
    }
  })
}

/** charge.dispute.created — chargeback opened */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const piId =
    typeof dispute.payment_intent === 'string'
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null)
  if (!piId) return
  const db = await getDb()
  await db.execute(
    `UPDATE transactions
     SET status = 'disputed', disputed_at = NOW(), updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [piId],
  )
}

/** payout.paid — Stripe payout landed in host bank account */
async function handlePayoutPaid(payout: Stripe.Payout) {
  const db = await getDb()
  await db.execute(
    `UPDATE payouts
     SET status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE stripe_payout_id = $1`,
    [payout.id],
  )
  // DB trigger trg_update_host_earnings fires automatically on status → 'paid'
}

/** payout.failed — Stripe payout to host failed */
async function handlePayoutFailed(payout: Stripe.Payout) {
  const db = await getDb()
  await db.execute(
    `UPDATE payouts
     SET status = 'failed',
         failure_code = $2,
         failure_message = $3,
         updated_at = NOW()
     WHERE stripe_payout_id = $1`,
    [payout.id, payout.failure_code ?? null, payout.failure_message ?? null],
  )
}

/** account.updated — Stripe Connect payout readiness changed */
async function handleAccountUpdated(account: Stripe.Account) {
  await PayoutAccountService.onAccountUpdated(account.id, Boolean(account.payouts_enabled && account.details_submitted))
}

/** identity.verification_session.* — KYC status update */
async function handleIdentityEvent(event: Stripe.Event) {
  const { KycService } = await import('@/domains/identity/KycService')
  await KycService.handleWebhookEvent(event)
}

/* ── Route handler ──────────────────────────────────────────── */

/**
 * POST /api/v1/webhooks/stripe
 *
 * IMPORTANT: Next.js must NOT parse the body before this handler.
 * The raw body is required for Stripe signature verification.
 * Ensure this route is excluded from any body-parsing middleware.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Read raw body as ArrayBuffer then convert — required for signature verification
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = StripeService.constructWebhookEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  // Idempotency: claim the event; a duplicate delivery is acknowledged.
  if (!(await claimEvent(event.id, event.type))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
        await handleHoldConfirmed(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent)
        break
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge)
        break
      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute)
        break
      case 'payout.paid':
        await handlePayoutPaid(event.data.object as Stripe.Payout)
        break
      case 'payout.failed':
        await handlePayoutFailed(event.data.object as Stripe.Payout)
        break
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account)
        break
      // ── Stripe Identity (KYC) ──────────────────────────────────────
      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
        await handleIdentityEvent(event)
        break
      default:
        // Unknown event type — acknowledge receipt but take no action
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    // Release the claim and return 500 so Stripe retries the event.
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, err)
    await releaseEvent(event.id).catch((e: unknown) => console.error('[stripe-webhook] release failed', e))
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
