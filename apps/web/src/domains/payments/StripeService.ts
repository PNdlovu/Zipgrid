/**
 * @file StripeService.ts
 * @description Stripe payments service — PaymentIntents, SetupIntents, Connect payouts.
 * All monetary values in pence (integer). Never floats.
 *
 * Stripe SDK note: amounts are always in the smallest currency unit.
 * For GBP that is pence, so our pence values pass directly to Stripe.
 *
 * @module domains/payments
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import Stripe from 'stripe'
import { ServiceUnavailableError } from '@/lib/errors/AppError'

/* ── Singleton Stripe client ────────────────────────────────── */

let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new ServiceUnavailableError('Payments')
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  return _stripe
}

/* ── Types ──────────────────────────────────────────────────── */

export type CreatePaymentIntentInput = {
  /** Amount in pence (GBP) */
  amountPence: number
  /** Stripe Customer id (cus_xxx) */
  stripeCustomerId: string
  /** Stripe PaymentMethod id (pm_xxx) — already saved to customer */
  paymentMethodId: string
  /** Internal booking id — stored as metadata for webhook reconciliation */
  bookingId: string
  /** Human-readable description shown in Stripe dashboard */
  description: string
  /** Stripe idempotency key — retries with the same key never create a second hold */
  idempotencyKey?: string
}

export type CapturePaymentIntentInput = {
  paymentIntentId: string
  /** Final amount to capture in pence — may differ from original hold */
  finalAmountPence: number
  idempotencyKey?: string
}

export type RefundInput = {
  paymentIntentId: string
  amountPence?: number // partial refund; omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  idempotencyKey?: string
}

export type CreateSetupIntentResult = {
  setupIntentId: string
  clientSecret: string
}

export type SavedPaymentMethod = {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

/**
 * Stripe service — all payment operations for the Zipgrid platform.
 */
export const StripeService = {
  /** True when a Stripe secret key is configured. */
  isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY)
  },

  /** True for card declines/authentication failures (as opposed to API or network errors). */
  isCardError(err: unknown): err is Error {
    return err instanceof Error && 'type' in err && String((err as { type: unknown }).type).startsWith('StripeCard')
  },

  /**
   * Creates a Stripe Customer for a new user.
   * One customer per user — idempotent by email.
   */
  async createCustomer(email: string, name: string): Promise<string> {
    const stripe = getStripe()
    const customer = await stripe.customers.create({ email, name })
    return customer.id
  },

  /**
   * Creates a PaymentIntent with capture_method: 'manual' (authorization hold).
   * The hold is placed on the driver's card at booking time.
   * Funds are only captured when the charging session completes.
   *
   * @returns Stripe PaymentIntent id (pi_xxx) and client_secret for frontend confirmation
   */
  async createPaymentIntentHold(input: CreatePaymentIntentInput): Promise<{
    paymentIntentId: string
    clientSecret: string
    status: string
  }> {
    const stripe = getStripe()

    const intent = await stripe.paymentIntents.create({
      amount: input.amountPence,
      currency: 'gbp',
      customer: input.stripeCustomerId,
      payment_method: input.paymentMethodId,
      capture_method: 'manual',   // authorize-only, not captured until session ends
      confirm: true,               // immediately attempt authorization
      description: input.description,
      metadata: {
        booking_id: input.bookingId,
        platform: 'zipgrid',
      },
      // Don't redirect — card payments only
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/bookings`,
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined)

    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? '',
      status: intent.status,
    }
  },

  /**
   * Charges a saved card immediately for a wallet top-up. The wallet is credited
   * only by the payment_intent.succeeded webhook, which recognises the
   * purpose=wallet_topup metadata. A `requires_action` status means the card
   * needs 3-D Secure; the client completes it with the returned client secret.
   */
  async createWalletTopUp(input: {
    amountPence: number
    stripeCustomerId: string
    paymentMethodId: string
    userId: string
    idempotencyKey: string
  }): Promise<{ paymentIntentId: string; clientSecret: string; status: string }> {
    const stripe = getStripe()
    const intent = await stripe.paymentIntents.create({
      amount: input.amountPence,
      currency: 'gbp',
      customer: input.stripeCustomerId,
      payment_method: input.paymentMethodId,
      confirm: true,
      description: `Zipgrid wallet top-up £${(input.amountPence / 100).toFixed(2)}`,
      metadata: { purpose: 'wallet_topup', user_id: input.userId, platform: 'zipgrid' },
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/wallet`,
    }, { idempotencyKey: input.idempotencyKey })
    return { paymentIntentId: intent.id, clientSecret: intent.client_secret ?? '', status: intent.status }
  },

  /**
   * Charges a saved card while the customer is not present (merchant-initiated):
   * auto top-ups and recovery of session shortfalls. The card must have been
   * saved for off-session use (SetupIntent usage 'off_session').
   * Card declines throw (see isCardError); a card that demands authentication
   * comes back as status 'requires_action' and is treated by callers as failed.
   */
  async chargeOffSession(input: {
    amountPence: number
    stripeCustomerId: string
    paymentMethodId: string
    description: string
    metadata: Record<string, string>
    idempotencyKey: string
  }): Promise<{ paymentIntentId: string; status: string }> {
    const stripe = getStripe()
    const intent = await stripe.paymentIntents.create({
      amount: input.amountPence,
      currency: 'gbp',
      customer: input.stripeCustomerId,
      payment_method: input.paymentMethodId,
      off_session: true,
      confirm: true,
      description: input.description,
      metadata: { ...input.metadata, platform: 'zipgrid' },
    }, { idempotencyKey: input.idempotencyKey })
    return { paymentIntentId: intent.id, status: intent.status }
  },

  /** The customer's default card, else their most recently saved one; null when none. */
  async getDefaultPaymentMethodId(stripeCustomerId: string): Promise<string | null> {
    const methods = await this.listPaymentMethods(stripeCustomerId)
    return (methods.find((m) => m.isDefault) ?? methods[0])?.id ?? null
  },

  /**
   * Captures a previously authorized PaymentIntent.
   * Called when the charging session ends and the final cost is known.
   * amount_to_capture must be ≤ original authorized amount.
   */
  async capturePaymentIntent(input: CapturePaymentIntentInput): Promise<Stripe.PaymentIntent> {
    const stripe = getStripe()
    return stripe.paymentIntents.capture(input.paymentIntentId, {
      amount_to_capture: input.finalAmountPence,
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined)
  },

  /**
   * Cancels an authorized PaymentIntent (releases the hold).
   * Called when a booking is cancelled before the session starts.
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    reason: Stripe.PaymentIntentCancelParams.CancellationReason = 'requested_by_customer',
  ): Promise<Stripe.PaymentIntent> {
    const stripe = getStripe()
    return stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: reason })
  },

  /**
   * Issues a full or partial refund on a captured PaymentIntent.
   */
  async refund(input: RefundInput): Promise<Stripe.Refund> {
    const stripe = getStripe()

    // Retrieve the PaymentIntent to get the charge id
    const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId)
    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id

    if (!chargeId) throw new Error('No charge found on PaymentIntent — cannot refund')

    return stripe.refunds.create({
      charge: chargeId,
      ...(input.amountPence !== undefined ? { amount: input.amountPence } : {}),
      reason: input.reason ?? 'requested_by_customer',
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined)
  },

  /**
   * Creates a SetupIntent so the frontend can collect and save a payment method.
   * The saved pm_xxx is then used for future PaymentIntent holds.
   */
  async createSetupIntent(stripeCustomerId: string): Promise<CreateSetupIntentResult> {
    const stripe = getStripe()
    const intent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session', // needed for server-side charges without driver being present
    })
    return {
      setupIntentId: intent.id,
      clientSecret: intent.client_secret ?? '',
    }
  },

  /**
   * Lists saved payment methods for a Stripe customer.
   */
  async listPaymentMethods(stripeCustomerId: string): Promise<SavedPaymentMethod[]> {
    const stripe = getStripe()

    const [methods, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card' }),
      stripe.customers.retrieve(stripeCustomerId) as Promise<Stripe.Customer>,
    ])

    const defaultPmId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id ?? null

    return methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'unknown',
      last4: pm.card?.last4 ?? '????',
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
      isDefault: pm.id === defaultPmId,
    }))
  },

  /**
   * Sets a payment method as the customer's default.
   */
  async setDefaultPaymentMethod(
    stripeCustomerId: string,
    paymentMethodId: string,
  ): Promise<void> {
    const stripe = getStripe()
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  },

  /**
   * Detaches (removes) a saved payment method.
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    const stripe = getStripe()
    await stripe.paymentMethods.detach(paymentMethodId)
  },

  // ── Stripe Connect (Host payouts) ──────────────────────────

  /**
   * Creates a Stripe Connect Express account for a host.
   * Returns the account id (acct_xxx) and an onboarding URL.
   */
  async createConnectAccount(
    email: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<{ accountId: string; onboardingUrl: string }> {
    const stripe = getStripe()

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })

    return { accountId: account.id, onboardingUrl: link.url }
  },

  /** Fresh onboarding link for an existing Connect account (links expire quickly). */
  async createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
    const stripe = getStripe()
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })
    return link.url
  },

  /**
   * Transfers funds to a host's Stripe Connect account.
   * Called by the weekly payout batch.
   *
   * @param amountPence - Net payout amount in pence
   * @param connectAccountId - Host's acct_xxx
   * @param description - Human-readable description
   * @param metadata - Additional metadata (payout_id, period, etc.)
   */
  async createTransfer(
    amountPence: number,
    connectAccountId: string,
    description: string,
    metadata: Record<string, string> = {},
    idempotencyKey?: string,
  ): Promise<Stripe.Transfer> {
    const stripe = getStripe()
    return stripe.transfers.create({
      amount: amountPence,
      currency: 'gbp',
      destination: connectAccountId,
      description,
      metadata,
    }, idempotencyKey ? { idempotencyKey } : undefined)
  },

  /**
   * Constructs and verifies a Stripe webhook event from raw request body + signature.
   * @throws if signature verification fails
   */
  constructWebhookEvent(
    rawBody: string | Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    const stripe = getStripe()
    return stripe.webhooks.constructEvent(rawBody, signature, secret)
  },
}
