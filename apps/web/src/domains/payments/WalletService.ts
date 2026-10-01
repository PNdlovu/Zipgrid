/**
 * @file WalletService.ts
 * @description In-platform wallet service — balance, top-up, spend, refund.
 * All monetary values in pence (integer). Never floats.
 *
 * Architecture:
 * - wallet_balances holds current balance (denormalised)
 * - wallet_transactions is the append-only ledger (source of truth)
 * - Every mutation writes a ledger row and updates the balance atomically
 * - Top-ups go via Stripe Customer Balance (not PaymentIntent)
 *
 * @module domains/payments
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { ValidationError, ConflictError, NotFoundError } from '@/lib/errors/AppError'

/* ── Types ──────────────────────────────────────────────────── */

export type WalletBalance = {
  userId: string
  balancePence: number
  pendingPence: number
  autoTopupEnabled: boolean
  autoTopupThresholdPence: number
  autoTopupAmountPence: number
  updatedAt: Date
}

export type WalletTransaction = {
  id: string
  userId: string
  type: string
  amountPence: number
  balanceAfterPence: number
  bookingId: string | null
  stripePiId: string | null
  description: string
  createdAt: Date
}

const MIN_TOPUP_PENCE = 500    // £5
const MAX_TOPUP_PENCE = 50_000 // £500

/**
 * Wallet service — all wallet operations.
 */
export const WalletService = {

  /**
   * Gets or creates a wallet balance record for a user.
   * Returns the current balance state.
   */
  async getBalance(userId: string): Promise<WalletBalance> {
    const db = await getDb()

    // Upsert — create wallet row on first access
    await db.execute(
      `INSERT INTO wallet_balances (user_id, balance_pence, pending_pence, updated_at)
       VALUES ($1, 0, 0, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )

    const res = await db.execute(
      `SELECT user_id, balance_pence, pending_pence,
              auto_topup_enabled, auto_topup_threshold_pence,
              auto_topup_amount_pence, updated_at
       FROM wallet_balances WHERE user_id = $1`,
      [userId],
    )

    const r = res.rows[0] as Record<string, unknown>
    return this._mapBalance(r)
  },

  /**
   * Credits the wallet after a Stripe top-up is confirmed.
   * Called from the Stripe webhook on payment_intent.succeeded for wallet top-ups.
   *
   * @param userId - User receiving the credit
   * @param amountPence - Amount to credit (must be ≥ £5, ≤ £500)
   * @param stripePiId - Stripe PaymentIntent ID for the top-up
   */
  async topUp(userId: string, amountPence: number, stripePiId: string): Promise<WalletBalance> {
    if (amountPence < MIN_TOPUP_PENCE) {
      throw new ValidationError(`Minimum top-up is £${MIN_TOPUP_PENCE / 100}.`)
    }
    if (amountPence > MAX_TOPUP_PENCE) {
      throw new ValidationError(`Maximum top-up is £${MAX_TOPUP_PENCE / 100}.`)
    }

    const db = await getDb()

    // Idempotency: check if this PI was already applied
    const existing = await db.execute(
      `SELECT id FROM wallet_transactions WHERE stripe_pi_id = $1 AND type = 'topup' LIMIT 1`,
      [stripePiId],
    )
    if (existing.rows.length > 0) {
      return this.getBalance(userId)
    }

    return this._credit(userId, amountPence, 'topup', `Wallet top-up`, null, stripePiId)
  },

  /**
   * Debits the wallet to pay for a session/booking.
   * @throws {ValidationError} if balance is insufficient
   * @throws {ConflictError} if bookingId already has a wallet payment
   */
  async spend(
    userId: string,
    amountPence: number,
    bookingId: string,
    description: string,
  ): Promise<WalletBalance> {
    const db = await getDb()
    const balance = await this.getBalance(userId)

    if (balance.balancePence < amountPence) {
      throw new ValidationError(
        `Insufficient wallet balance. Available: £${(balance.balancePence / 100).toFixed(2)}, required: £${(amountPence / 100).toFixed(2)}.`,
      )
    }

    // Idempotency: one wallet payment per booking
    const existing = await db.execute(
      `SELECT id FROM wallet_transactions WHERE booking_id = $1 AND type = 'session_payment' LIMIT 1`,
      [bookingId],
    )
    if (existing.rows.length > 0) {
      throw new ConflictError('Wallet payment already recorded for this booking.', 'WALLET_ALREADY_PAID')
    }

    return this._debit(userId, amountPence, 'session_payment', description, bookingId, null)
  },

  /**
   * Credits a refund back to the wallet (e.g. cancelled booking).
   */
  async refund(
    userId: string,
    amountPence: number,
    bookingId: string,
    description: string,
  ): Promise<WalletBalance> {
    return this._credit(userId, amountPence, 'refund', description, bookingId, null)
  },

  /**
   * Credits reward redemption to the wallet.
   * Called by RewardsService.redeem().
   */
  async creditRewardRedemption(
    userId: string,
    amountPence: number,
    description: string,
  ): Promise<WalletBalance> {
    return this._credit(userId, amountPence, 'reward_redemption', description, null, null)
  },

  /**
   * Updates auto top-up settings.
   */
  async setAutoTopup(
    userId: string,
    enabled: boolean,
    thresholdPence: number,
    amountPence: number,
  ): Promise<void> {
    if (amountPence < MIN_TOPUP_PENCE) {
      throw new ValidationError(`Auto top-up amount must be at least £${MIN_TOPUP_PENCE / 100}.`)
    }
    const db = await getDb()
    await db.execute(
      `UPDATE wallet_balances
       SET auto_topup_enabled = $2,
           auto_topup_threshold_pence = $3,
           auto_topup_amount_pence = $4,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, enabled, thresholdPence, amountPence],
    )
  },

  /**
   * Checks if auto top-up should be triggered and returns the amount to top up.
   * Returns null if not needed.
   */
  async checkAutoTopup(userId: string): Promise<number | null> {
    const balance = await this.getBalance(userId)
    if (
      balance.autoTopupEnabled &&
      balance.balancePence < balance.autoTopupThresholdPence
    ) {
      return balance.autoTopupAmountPence
    }
    return null
  },

  /**
   * Returns paginated transaction history for a user.
   */
  async getHistory(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const db = await getDb()
    const offset = (page - 1) * pageSize

    const [countRes, txRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM wallet_transactions WHERE user_id = $1`, [userId]),
      db.execute(
        `SELECT id, user_id, type, amount_pence, balance_after_pence,
                booking_id, stripe_pi_id, description, created_at
         FROM wallet_transactions WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      ),
    ])

    return {
      transactions: txRes.rows.map((r) => this._mapTx(r as Record<string, unknown>)),
      total: (countRes.rows[0] as { total: number }).total,
    }
  },

  // ── Private helpers ───────────────────────────────────────

  async _credit(
    userId: string,
    amountPence: number,
    type: string,
    description: string,
    bookingId: string | null,
    stripePiId: string | null,
  ): Promise<WalletBalance> {
    const db = await getDb()
    // Ensure wallet row exists
    await this.getBalance(userId)

    const txId = uuidv4()
    await db.execute(
      `WITH updated AS (
         UPDATE wallet_balances
         SET balance_pence = balance_pence + $2, updated_at = NOW()
         WHERE user_id = $1
         RETURNING balance_pence
       )
       INSERT INTO wallet_transactions
         (id, user_id, type, amount_pence, balance_after_pence, booking_id, stripe_pi_id, description, created_at)
       SELECT $3, $1, $4, $2, balance_pence, $5, $6, $7, NOW()
       FROM updated`,
      [userId, amountPence, txId, type, bookingId, stripePiId, description],
    )
    return this.getBalance(userId)
  },

  async _debit(
    userId: string,
    amountPence: number,
    type: string,
    description: string,
    bookingId: string | null,
    stripePiId: string | null,
  ): Promise<WalletBalance> {
    const db = await getDb()
    const txId = uuidv4()
    // The CTE only executes the INSERT if the UPDATE finds a row with sufficient balance.
    // If balance was insufficient, the INSERT is skipped — we check by re-reading balance.
    const beforeBalance = await this.getBalance(userId)
    if (beforeBalance.balancePence < amountPence) {
      throw new ValidationError(
        `Insufficient wallet balance. Available: £${(beforeBalance.balancePence / 100).toFixed(2)}.`,
      )
    }

    await db.execute(
      `WITH updated AS (
         UPDATE wallet_balances
         SET balance_pence = balance_pence - $2, updated_at = NOW()
         WHERE user_id = $1 AND balance_pence >= $2
         RETURNING balance_pence
       )
       INSERT INTO wallet_transactions
         (id, user_id, type, amount_pence, balance_after_pence, booking_id, stripe_pi_id, description, created_at)
       SELECT $3, $1, $4, -$2, balance_pence, $5, $6, $7, NOW()
       FROM updated`,
      [userId, amountPence, txId, type, bookingId, stripePiId, description],
    )
    return this.getBalance(userId)
  },

  _mapBalance(r: Record<string, unknown>): WalletBalance {
    return {
      userId: r['user_id'] as string,
      balancePence: Number(r['balance_pence']),
      pendingPence: Number(r['pending_pence']),
      autoTopupEnabled: Boolean(r['auto_topup_enabled']),
      autoTopupThresholdPence: Number(r['auto_topup_threshold_pence'] ?? 500),
      autoTopupAmountPence: Number(r['auto_topup_amount_pence'] ?? 2000),
      updatedAt: new Date(r['updated_at'] as string),
    }
  },

  _mapTx(r: Record<string, unknown>): WalletTransaction {
    return {
      id: r['id'] as string,
      userId: r['user_id'] as string,
      type: r['type'] as string,
      amountPence: Number(r['amount_pence']),
      balanceAfterPence: Number(r['balance_after_pence']),
      bookingId: (r['booking_id'] as string | null) ?? null,
      stripePiId: (r['stripe_pi_id'] as string | null) ?? null,
      description: r['description'] as string,
      createdAt: new Date(r['created_at'] as string),
    }
  },
}
