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

/* ── Helpers ────────────────────────────────────────────────── */

async function getDb() {
  const { getDb: _getDb } = await import('@/lib/db')
  return _getDb()
}

/** Idempotency check — returns true if event already processed */
async function isDuplicate(eventId: string, eventType: string): Promise<boolean> {
  const db = await getDb()
  try {
    await db.execute(
      `INSERT INTO stripe_webhook_events (id, event_type) VALUES ($1, $2)`,
      [eventId, eventType],
    )
    return false // successfully inserted → first time seeing this event
  } catch {
    return true // unique constraint violation → already processed
  }
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

/** payment_intent.succeeded — capture completed */
async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const db = await getDb()

  // Update transaction
  await db.execute(
    `UPDATE transactions
     SET status = 'captured',
         total_charged_cents = $2,
         stripe_charge_id = $3,
         captured_at = NOW(),
         updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [
      pi.id,
      pi.amount_received,
      typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge?.id ?? null),
    ],
  )

  // Mark booking completed
  await db.execute(
    `UPDATE bookings b
     SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     FROM transactions t
     WHERE t.stripe_payment_intent_id = $1 AND t.booking_id = b.id
       AND b.status NOT IN ('cancelled_by_driver','cancelled_by_host','cancelled_by_platform','no_show','completed')`,
    [pi.id],
  )

  // Publish domain event for downstream (rewards, reviews prompt, payout scheduling)
  const txnResult = await db.execute(
    `SELECT t.id, t.booking_id, t.total_charged_cents, dp.user_id AS driver_user
     FROM transactions t
     JOIN bookings b ON b.id = t.booking_id
     JOIN driver_profiles dp ON dp.id = b.driver_profile_id
     WHERE t.stripe_payment_intent_id = $1 LIMIT 1`,
    [pi.id],
  )
  if (txnResult.rows.length > 0) {
    const row = txnResult.rows[0] as {
      id: string
      booking_id: string
      total_charged_cents: number
      driver_user: string
    }
    eventBus.publish({
      type: 'PAYMENT_CAPTURED',
      transactionId: row.id,
      amountPence: row.total_charged_cents,
      driverId: row.driver_user,
    })
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
  const db = await getDb()

  const totalRefunded = charge.amount_refunded
  const isFullRefund = charge.refunded

  await db.execute(
    `UPDATE transactions
     SET status = $2,
         refunded_cents = $3,
         refunded_at = NOW(),
         updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [piId, isFullRefund ? 'fully_refunded' : 'partially_refunded', totalRefunded],
  )
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

/** account.updated — Stripe Connect onboarding state changed */
async function handleAccountUpdated(account: Stripe.Account) {
  if (!account.charges_enabled) return
  const db = await getDb()
  await db.execute(
    `UPDATE host_profiles
     SET stripe_connect_onboarded = true, updated_at = NOW()
     WHERE stripe_connect_account_id = $1`,
    [account.id],
  )
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

  // Idempotency check
  const alreadyProcessed = await isDuplicate(event.id, event.type)
  if (alreadyProcessed) {
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
    // Return 500 so Stripe retries. The idempotency table prevents double-processing
    // once the retry succeeds.
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
