/**
 * @file route.ts
 * @description GET /api/v1/admin/disputes — paginated dispute queue.
 *              PATCH /api/v1/admin/disputes — resolve/escalate a dispute.
 *
 * @module apps/web/api/v1/admin/disputes
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { StripeService } from '@/domains/payments/StripeService'
import { EarningsAllocator } from '@/domains/payments/EarningsAllocator'
import { WalletService } from '@/domains/payments/WalletService'
import { AuditLogger } from '@/domains/compliance/AuditLogger'

function requireAdmin(req: NextRequest) {
  return (req.headers.get('x-user-roles') ?? '').split(',').map((r) => r.trim()).includes('admin')
}

/** GET /api/v1/admin/disputes — paginated dispute queue. */
export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10)))
  const offset = (page - 1) * pageSize
  const status = searchParams.get('status') ?? ''

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const conditions = status ? [`d.status = $1`] : []
    const values: unknown[] = status ? [status] : []
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    let i = values.length + 1

    const [countRes, disputesRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM disputes d ${where}`, values),
      db.execute(
        `SELECT d.id, d.status, d.dispute_type, d.created_at, d.resolution_notes,
                d.resolution_amount_cents AS refund_amount_cents, d.booking_id,
                u_raiser.full_name AS raised_by_name, u_raiser.email AS raised_by_email,
                u_against.full_name AS raised_against_name,
                b.scheduled_start, cl.title AS listing_title
         FROM disputes d
         JOIN users u_raiser ON u_raiser.id = d.raised_by_user_id
         LEFT JOIN users u_against ON u_against.id = d.against_user_id
         LEFT JOIN bookings b ON b.id = d.booking_id
         LEFT JOIN charger_listings cl ON cl.id = b.listing_id
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total
    return apiResponse(disputesRes.rows, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/admin/disputes]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const PatchDisputeSchema = z.object({
  disputeId: z.string().uuid(),
  action: z.enum(['resolve_driver', 'resolve_host', 'resolve_split', 'escalate', 'close']),
  resolutionNotes: z.string().max(2000).optional(),
  refundAmountPence: z.number().int().nonnegative().optional(),
})

/** PATCH /api/v1/admin/disputes — resolve/escalate a dispute. */
export async function PATCH(request: NextRequest) {
  const adminUserId = request.headers.get('x-user-id')
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = PatchDisputeSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  const { disputeId, action, resolutionNotes, refundAmountPence } = parsed.data

  const STATUS_MAP: Record<string, string> = {
    resolve_driver: 'resolved_driver_favour',
    resolve_host: 'resolved_host_favour',
    resolve_split: 'resolved_split',
    escalate: 'escalated_to_insurer',
    close: 'closed',
  }
  const newStatus = STATUS_MAP[action]!

  const refundPence = action === 'resolve_driver' || action === 'resolve_split' ? (refundAmountPence ?? 0) : 0
  const isResolution = action !== 'escalate'

  try {
    const { transaction } = await import('@/lib/db')
    const refunded = await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT d.status, t.id AS transaction_id, t.status AS txn_status,
                t.stripe_payment_intent_id, t.payment_source, d.booking_id, dp.user_id AS driver_user_id,
                COALESCE(t.total_charged_cents, 0) - COALESCE(t.refunded_cents, 0) AS refundable_cents
         FROM disputes d
         LEFT JOIN transactions t ON t.booking_id = d.booking_id
         LEFT JOIN bookings b ON b.id = d.booking_id
         LEFT JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE d.id = $1
         FOR UPDATE OF d`,
        [disputeId],
      )
      const d = res.rows[0]
      if (!d) throw new NotFoundError('Dispute', disputeId)
      if (['resolved_driver_favour', 'resolved_host_favour', 'resolved_split', 'closed'].includes(d['status'] as string)) {
        throw new ConflictError(`Dispute is already ${d['status'] as string}.`, 'DISPUTE_ALREADY_RESOLVED')
      }

      if (refundPence > 0) {
        if (!d['transaction_id'] || !['captured', 'partially_refunded'].includes(d['txn_status'] as string)) {
          throw new ValidationError('There is no captured payment on this booking to refund.')
        }
        if (refundPence > Number(d['refundable_cents'])) {
          throw new ValidationError(`Refund exceeds the refundable amount (${Number(d['refundable_cents'])}p).`)
        }
        if (d['payment_source'] === 'wallet') {
          // Wallet-paid bookings are refunded to the wallet they were paid from.
          await WalletService.refund(tx, d['driver_user_id'] as string, d['booking_id'] as string, refundPence, 'Dispute refund')
        } else {
          await StripeService.refund({
            paymentIntentId: d['stripe_payment_intent_id'] as string,
            amountPence: refundPence,
            idempotencyKey: `dispute-refund-${disputeId}`,
          })
        }
        await tx.execute(
          `UPDATE transactions
           SET refunded_cents = COALESCE(refunded_cents, 0) + $2,
               status = CASE WHEN COALESCE(refunded_cents, 0) + $2 >= COALESCE(total_charged_cents, 0)
                             THEN 'fully_refunded'::transaction_status
                             ELSE 'partially_refunded'::transaction_status END,
               refund_reason = 'dispute_resolution', refunded_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [d['transaction_id'], refundPence],
        )
        // Refunds come out of host earnings net of the platform fee share.
        const feeRes = await tx.execute(`SELECT commission_rate_pct FROM transactions WHERE id = $1`, [d['transaction_id']])
        const feeRate = Number(feeRes.rows[0]?.['commission_rate_pct'] ?? 15) / 100
        await EarningsAllocator.allocateRefund(tx, d['transaction_id'] as string, Math.round(refundPence * (1 - feeRate)), `refund:${disputeId.slice(0, 30)}`)
      }

      await tx.execute(
        `UPDATE disputes
         SET status = $2::dispute_status,
             resolution_notes = COALESCE($3, resolution_notes),
             resolution_amount_cents = CASE WHEN $4 > 0 THEN $4 ELSE resolution_amount_cents END,
             assigned_agent_id = COALESCE(assigned_agent_id, $5),
             resolved_at = CASE WHEN $6 THEN NOW() ELSE resolved_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [disputeId, newStatus, resolutionNotes ?? null, refundPence, adminUserId, isResolution],
      )
      return refundPence
    })

    await AuditLogger.logAsync({
      eventType: 'admin.dispute_resolved',
      actorId: adminUserId ?? undefined,
      targetId: disputeId,
      targetType: 'dispute',
      metadata: { action, newStatus, refundedPence: refunded },
    })

    return apiResponse({ updated: true, disputeId, newStatus, refundedPence: refunded })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[PATCH /api/v1/admin/disputes]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
