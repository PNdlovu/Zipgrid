/**
 * @file route.ts
 * @description GET /api/v1/disputes  — list disputes raised by the authenticated user.
 *              POST /api/v1/disputes — raise a new dispute on a completed booking.
 *
 * Disputes are created in status 'open'. The admin panel (PATCH /api/v1/admin/disputes)
 * handles resolution. Both the raising party and the raised-against party can add
 * evidence via POST /api/v1/disputes/[id]/evidence.
 *
 * Query params (GET):
 *   status   — filter by dispute status (optional)
 *   page     — 1-based page (default 1)
 *   pageSize — max 50 (default 10)
 *
 * @module apps/web/api/v1/disputes
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { AuditLogger } from '@/domains/compliance/AuditLogger'

/* ── Schema ────────────────────────────────────────────────── */

const DisputeTypeValues = [
  'session_fault',
  'charger_unavailable',
  'billing',
  'property_damage',
  'driver_behaviour',
  'other',
] as const

const CreateDisputeSchema = z.object({
  disputeType: z.enum(DisputeTypeValues),
  description: z.string().min(10, 'Please describe what happened (at least 10 characters)').max(2000),
  bookingId: z.string().uuid({ message: 'Select the booking this dispute is about' }),
})

/* ── GET ─────────────────────────────────────────────────── */

/**
 * GET /api/v1/disputes
 * Returns disputes raised by or against the authenticated user.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const status   = searchParams.get('status') ?? undefined
  const page     = Math.max(1,  parseInt(searchParams.get('page')     ?? '1',  10))
  const pageSize = Math.min(50, parseInt(searchParams.get('pageSize') ?? '10', 10))
  const offset   = (page - 1) * pageSize

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const params: unknown[] = [userId, userId]
    let statusClause = ''
    if (status) {
      params.push(status)
      statusClause = `AND d.status = $${params.length}`
    }

    const [countRes, listRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS total
         FROM disputes d
         WHERE (d.raised_by_user_id = $1 OR d.against_user_id = $2)
         ${statusClause}`,
        params,
      ),
      db.execute(
        `SELECT d.id, d.status, d.dispute_type, d.description,
                d.raised_by_user_id, d.against_user_id,
                d.booking_id,
                d.resolution_notes, d.resolution_amount_cents AS refund_amount_cents,
                d.created_at, d.updated_at,
                cl.title AS listing_title
         FROM disputes d
         LEFT JOIN bookings b ON b.id = d.booking_id
         LEFT JOIN charger_listings cl ON cl.id = b.listing_id
         WHERE (d.raised_by_user_id = $1 OR d.against_user_id = $2)
         ${statusClause}
         ORDER BY d.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total

    const disputes = listRes.rows.map((r) => {
      const row = r as Record<string, unknown>
      return {
        id:                   row['id'],
        status:               row['status'],
        disputeType:          row['dispute_type'],
        description:          row['description'],
        raisedByUserId:       row['raised_by_user_id'],
        raisedAgainstUserId:  row['against_user_id'],
        bookingId:            row['booking_id'] ?? null,
        listingTitle:         row['listing_title'] ?? null,
        resolutionNotes:      row['resolution_notes'] ?? null,
        refundAmountPence:    row['refund_amount_cents'] != null ? Number(row['refund_amount_cents']) : null,
        raisedAt:             row['created_at'],
        updatedAt:            row['updated_at'],
      }
    })

    return apiResponse(disputes, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/disputes]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/* ── POST ────────────────────────────────────────────────── */

/**
 * POST /api/v1/disputes
 * Creates a new dispute. Sets status to 'open'.
 * If bookingId is provided, identifies the host as the raised-against party.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = CreateDisputeSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const { disputeType, description, bookingId } = parsed.data

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // If bookingId provided, verify it exists and belongs to this driver,
    // and identify the host as the raised-against party.
    let raisedAgainstUserId: string | null = null
    let verifiedBookingId: string | null = bookingId ?? null

    if (bookingId) {
      const bookingRes = await db.execute(
        `SELECT b.id, b.status,
                hp.user_id AS host_user_id
         FROM bookings b
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN host_profiles hp ON hp.id = cl.host_profile_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         WHERE b.id = $1 AND dp.user_id = $2
         LIMIT 1`,
        [bookingId, userId],
      )

      if (bookingRes.rows.length === 0) {
        return apiError('NOT_FOUND', 'Booking not found or not associated with your account', 404)
      }

      const booking = bookingRes.rows[0] as { id: string; status: string; host_user_id: string }
      raisedAgainstUserId = booking.host_user_id
      verifiedBookingId   = booking.id

      // Only allow disputes on completed, active, or cancelled bookings
      const disputeableStatuses = ['completed', 'active', 'cancelled_by_driver', 'cancelled_by_host', 'cancelled_by_platform']
      if (!disputeableStatuses.includes(booking.status)) {
        return apiError(
          'INVALID_STATE',
          `Disputes can only be raised on completed or cancelled bookings (current status: ${booking.status}).`,
          409,
        )
      }

      // Check for duplicate dispute on same booking
      const existingRes = await db.execute(
        `SELECT id FROM disputes
         WHERE booking_id = $1 AND raised_by_user_id = $2 AND status NOT IN ('closed')
         LIMIT 1`,
        [bookingId, userId],
      )
      if (existingRes.rows.length > 0) {
        return apiError(
          'DUPLICATE_DISPUTE',
          'A dispute for this booking is already open. Please use the existing case.',
          409,
        )
      }
    }

    const disputeId = uuidv4()

    await db.execute(
      `INSERT INTO disputes
         (id, raised_by_user_id, against_user_id, booking_id, transaction_id,
          dispute_type, title, description, status)
       VALUES ($1, $2, $3, $4, (SELECT id FROM transactions WHERE booking_id = $4 LIMIT 1),
               $5, $6, $7, 'open')`,
      [disputeId, userId, raisedAgainstUserId, verifiedBookingId, disputeType,
       disputeType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), description],
    )

    // Insert audit log entry
    await AuditLogger.logAsync({
      eventType: 'dispute.opened',
      actorId: userId,
      targetId: disputeId,
      targetType: 'dispute',
      metadata: { disputeType, bookingId: verifiedBookingId },
    })

    // Fetch the created dispute to return
    const newRes = await db.execute(
      `SELECT d.id, d.status, d.dispute_type, d.description,
              d.raised_by_user_id, d.against_user_id,
              d.booking_id, d.created_at, d.updated_at,
              cl.title AS listing_title
       FROM disputes d
       LEFT JOIN bookings b ON b.id = d.booking_id
       LEFT JOIN charger_listings cl ON cl.id = b.listing_id
       WHERE d.id = $1 LIMIT 1`,
      [disputeId],
    )

    const row = newRes.rows[0] as Record<string, unknown>
    return apiResponse(
      {
        id:                   row['id'],
        status:               row['status'],
        disputeType:          row['dispute_type'],
        description:          row['description'],
        raisedByUserId:       row['raised_by_user_id'],
        raisedAgainstUserId:  row['against_user_id'] ?? null,
        bookingId:            row['booking_id'] ?? null,
        listingTitle:         row['listing_title'] ?? null,
        resolutionNotes:      null,
        refundAmountPence:    null,
        raisedAt:             row['created_at'],
        updatedAt:            row['updated_at'],
      },
      undefined,
      201,
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/disputes]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
