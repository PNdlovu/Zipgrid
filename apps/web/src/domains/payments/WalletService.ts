/**
 * @file WalletService.ts
 * @description In-platform wallet — balance, Stripe top-ups, booking
 * reservations and settlement, refunds. All amounts are integer pence.
 *
 * Model:
 * - wallet_balances.balance_pence is the wallet total; pending_pence is the
 *   part reserved for open wallet-paid bookings. available = balance − pending.
 * - wallet_transactions is the append-only ledger of money movements; each row
 *   snapshots balance_pence after it. Reservations are not money movements, so
 *   they change pending_pence only and write no ledger row.
 * - Every mutation runs in a transaction holding the wallet row lock.
 * - Top-ups are card PaymentIntents tagged purpose=wallet_topup; the Stripe
 *   webhook credits them (idempotent per PaymentIntent).
 *
 * @module domains/payments
 */

import { getDb, transaction, type Db } from '@/lib/db'
import { AppError, ValidationError } from '@/lib/errors/AppError'

/* ── Types ──────────────────────────────────────────────────── */

export type WalletBalance = {
  userId: string
  balancePence: number
  pendingPence: number
  availablePence: number
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

type LedgerEntry = {
  type: 'topup' | 'session_payment' | 'shortfall_payment' | 'refund' | 'reward_redemption' | 'withdrawal' | 'adjustment'
  /** Signed: positive credits, negative debits. */
  amountPence: number
  description: string
  bookingId?: string | null
  stripePiId?: string | null
}

export const MIN_TOPUP_PENCE = 500    // £5
export const MAX_TOPUP_PENCE = 50_000 // £500

const fmt = (pence: number) => `£${(pence / 100).toFixed(2)}`

/** Thrown when a reservation exceeds the available balance; carries the gap so callers can auto top-up. */
export class InsufficientWalletBalanceError extends AppError {
  constructor(public readonly availablePence: number, public readonly requiredPence: number) {
    super(
      `Insufficient wallet balance. Available: ${fmt(availablePence)}, required: ${fmt(requiredPence)}.`,
      'INSUFFICIENT_WALLET_BALANCE',
      402,
    )
  }
}

/* ── Row-level helpers (run inside a caller's transaction) ──── */

/** Creates the wallet row if missing and locks it for the rest of the transaction. */
async function lockWallet(tx: Db, userId: string): Promise<{ balance: number; pending: number }> {
  await tx.execute(
    `INSERT INTO wallet_balances (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
  const res = await tx.execute(
    `SELECT balance_pence, pending_pence FROM wallet_balances WHERE user_id = $1 FOR UPDATE`,
    [userId],
  )
  const r = res.rows[0]!
  return { balance: Number(r['balance_pence']), pending: Number(r['pending_pence']) }
}

/** Applies a ledger entry to a locked wallet: moves the balance and records the row. */
async function post(tx: Db, userId: string, entry: LedgerEntry, pendingDelta = 0): Promise<void> {
  const res = await tx.execute(
    `UPDATE wallet_balances
     SET balance_pence = balance_pence + $2, pending_pence = pending_pence + $3, updated_at = NOW()
     WHERE user_id = $1
     RETURNING balance_pence`,
    [userId, entry.amountPence, pendingDelta],
  )
  if (entry.amountPence === 0) return
  await tx.execute(
    `INSERT INTO wallet_transactions
       (user_id, type, amount_pence, balance_after_pence, booking_id, stripe_pi_id, description)
     VALUES ($1, $2::wallet_tx_type, $3, $4, $5, $6, $7)`,
    [
      userId, entry.type, entry.amountPence, res.rows[0]!['balance_pence'],
      entry.bookingId ?? null, entry.stripePiId ?? null, entry.description,
    ],
  )
}

/* ── Service ────────────────────────────────────────────────── */

export const WalletService = {
  /** Current wallet state; creates the wallet on first access. */
  async getBalance(userId: string): Promise<WalletBalance> {
    const db = await getDb()
    await db.execute(
      `INSERT INTO wallet_balances (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )
    const res = await db.execute(
      `SELECT user_id, balance_pence, pending_pence, auto_topup_enabled,
              auto_topup_threshold_pence, auto_topup_amount_pence, updated_at
       FROM wallet_balances WHERE user_id = $1`,
      [userId],
    )
    return mapBalance(res.rows[0]!)
  },

  /**
   * Credits a confirmed Stripe top-up. Idempotent per PaymentIntent, so webhook
   * redeliveries never credit twice (uq_wallet_topup_pi is the backstop).
   */
  async topUp(userId: string, amountPence: number, stripePiId: string): Promise<void> {
    if (!Number.isInteger(amountPence) || amountPence <= 0) {
      throw new ValidationError('Top-up amount must be a positive whole number of pence.')
    }
    await transaction(async (tx) => {
      await lockWallet(tx, userId)
      const dup = await tx.execute(
        `SELECT 1 FROM wallet_transactions WHERE stripe_pi_id = $1 AND type = 'topup'`,
        [stripePiId],
      )
      if (dup.rows.length > 0) return
      await post(tx, userId, { type: 'topup', amountPence, description: 'Wallet top-up', stripePiId })
    })
  },

  /**
   * Reserves funds for a wallet-paid booking inside the caller's transaction.
   * @throws {InsufficientWalletBalanceError} (402)
   */
  async reserve(tx: Db, userId: string, amountPence: number): Promise<void> {
    const { balance, pending } = await lockWallet(tx, userId)
    const available = balance - pending
    if (available < amountPence) throw new InsufficientWalletBalanceError(available, amountPence)
    await tx.execute(
      `UPDATE wallet_balances SET pending_pence = pending_pence + $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, amountPence],
    )
  },

  /** Drops a reservation without moving money (cancellation, no-show, zero-cost session). */
  async release(tx: Db, userId: string, reservedPence: number): Promise<void> {
    await lockWallet(tx, userId)
    await tx.execute(
      `UPDATE wallet_balances SET pending_pence = GREATEST(pending_pence - $2, 0), updated_at = NOW()
       WHERE user_id = $1`,
      [userId, reservedPence],
    )
  },

  /**
   * Settles a reservation: debits `chargePence` (≤ reservedPence) and drops the
   * reservation, inside the caller's transaction.
   */
  async settle(
    tx: Db,
    userId: string,
    bookingId: string,
    reservedPence: number,
    chargePence: number,
  ): Promise<void> {
    if (chargePence > reservedPence) throw new Error('Wallet charge exceeds reservation')
    await lockWallet(tx, userId)
    await post(
      tx,
      userId,
      { type: 'session_payment', amountPence: -chargePence, description: 'Charging session', bookingId },
      -reservedPence,
    )
  },

  /**
   * Debits up to `maxPence` of the available balance towards a session
   * shortfall, inside the caller's transaction. Returns the amount debited.
   */
  async debitAvailable(tx: Db, userId: string, bookingId: string, maxPence: number, description = 'Outstanding session balance'): Promise<number> {
    const { balance, pending } = await lockWallet(tx, userId)
    const amount = Math.max(0, Math.min(maxPence, balance - pending))
    if (amount > 0) {
      await post(tx, userId, { type: 'shortfall_payment', amountPence: -amount, description, bookingId })
    }
    return amount
  },

  /**
   * Top-ups that can still be refunded to their card, newest first:
   * top-up amount minus withdrawals already made against that PaymentIntent.
   */
  async refundableTopUps(userId: string): Promise<{ stripePiId: string; refundablePence: number }[]> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT t.stripe_pi_id,
              t.amount_pence + COALESCE((SELECT SUM(w.amount_pence) FROM wallet_transactions w
                                         WHERE w.user_id = t.user_id AND w.type = 'withdrawal'
                                           AND w.stripe_pi_id = t.stripe_pi_id), 0) AS refundable
       FROM wallet_transactions t
       WHERE t.user_id = $1 AND t.type = 'topup' AND t.stripe_pi_id IS NOT NULL
       ORDER BY t.created_at DESC`,
      [userId],
    )
    return res.rows
      .map((r) => ({ stripePiId: r['stripe_pi_id'] as string, refundablePence: Number(r['refundable']) }))
      .filter((r) => r.refundablePence > 0)
  },

  /** Records money returned to the card a top-up came from. */
  async recordWithdrawal(userId: string, amountPence: number, stripePiId: string, description: string): Promise<void> {
    await transaction(async (tx) => {
      await lockWallet(tx, userId)
      await post(tx, userId, { type: 'withdrawal', amountPence: -amountPence, description, stripePiId })
    })
  },

  /** Removes non-refundable credit (promotional, rewards) — used when an account is closed. */
  async forfeitRemaining(userId: string, description: string): Promise<number> {
    return transaction(async (tx) => {
      const { balance, pending } = await lockWallet(tx, userId)
      if (pending > 0) throw new ValidationError('The wallet has funds reserved for open bookings.')
      if (balance > 0) await post(tx, userId, { type: 'adjustment', amountPence: -balance, description })
      return balance
    })
  },

  /** Credits a refund for a wallet-paid booking, inside the caller's transaction. */
  async refund(tx: Db, userId: string, bookingId: string, amountPence: number, description: string): Promise<void> {
    await lockWallet(tx, userId)
    await post(tx, userId, { type: 'refund', amountPence, description, bookingId })
  },

  /** Credits a loyalty-points redemption inside the caller's transaction. Called by RewardsService.redeem(). */
  async creditRewardRedemption(tx: Db, userId: string, amountPence: number, description: string): Promise<void> {
    await lockWallet(tx, userId)
    await post(tx, userId, { type: 'reward_redemption', amountPence, description })
  },

  /** Updates auto top-up settings. Re-enabling clears the failure counter. */
  async setAutoTopup(userId: string, enabled: boolean, thresholdPence: number, amountPence: number): Promise<void> {
    if (amountPence < MIN_TOPUP_PENCE) {
      throw new ValidationError(`Auto top-up amount must be at least ${fmt(MIN_TOPUP_PENCE)}.`)
    }
    await this.getBalance(userId) // ensure the row exists
    const db = await getDb()
    await db.execute(
      `UPDATE wallet_balances
       SET auto_topup_enabled = $2, auto_topup_threshold_pence = $3,
           auto_topup_amount_pence = $4,
           auto_topup_failures = CASE WHEN $2 THEN 0 ELSE auto_topup_failures END,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, enabled, thresholdPence, amountPence],
    )
  },

  /** Paginated ledger, newest first. */
  async getHistory(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const db = await getDb()
    const [countRes, txRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM wallet_transactions WHERE user_id = $1`, [userId]),
      db.execute(
        `SELECT id, user_id, type, amount_pence, balance_after_pence,
                booking_id, stripe_pi_id, description, created_at
         FROM wallet_transactions WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, (page - 1) * pageSize],
      ),
    ])
    return {
      transactions: txRes.rows.map(mapTx),
      total: Number(countRes.rows[0]?.['total'] ?? 0),
    }
  },
}

/* ── Mappers ────────────────────────────────────────────────── */

function mapBalance(r: Record<string, unknown>): WalletBalance {
  const balancePence = Number(r['balance_pence'])
  const pendingPence = Number(r['pending_pence'])
  return {
    userId: r['user_id'] as string,
    balancePence,
    pendingPence,
    availablePence: balancePence - pendingPence,
    autoTopupEnabled: Boolean(r['auto_topup_enabled']),
    autoTopupThresholdPence: Number(r['auto_topup_threshold_pence'] ?? 500),
    autoTopupAmountPence: Number(r['auto_topup_amount_pence'] ?? 2000),
    updatedAt: new Date(r['updated_at'] as string),
  }
}

function mapTx(r: Record<string, unknown>): WalletTransaction {
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
}
