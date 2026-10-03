/**
 * @file route.ts
 * @description GET /api/v1/webhooks/subscriptions — list user's webhook subscriptions.
 *              POST /api/v1/webhooks/subscriptions — register a new webhook endpoint.
 *              DELETE /api/v1/webhooks/subscriptions?id=xxx — remove a subscription.
 *
 * Each subscription receives an HMAC-SHA256 signing secret returned once at creation.
 * Deliveries are signed: X-Zipgrid-Signature: sha256=<hmac>
 *
 * @module apps/web/api/v1/webhooks/subscriptions
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const VALID_EVENTS = [
  'session.started', 'session.completed', 'booking.confirmed', 'booking.cancelled',
  'payout.paid', 'listing.published', 'charger.faulted', 'emergency.accepted',
] as const

const CreateSubscriptionSchema = z.object({
  url: z.string().url('Must be a valid HTTPS URL').refine((u) => u.startsWith('https://'), {
    message: 'Webhook URL must use HTTPS',
  }),
  events: z.array(z.enum(VALID_EVENTS)).min(1, 'Select at least one event'),
})

/** GET /api/v1/webhooks/subscriptions — list user's webhook subscriptions. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, url, events, is_active, last_delivery_at, failure_count, created_at
       FROM webhook_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    )
    return apiResponse(res.rows)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** POST /api/v1/webhooks/subscriptions — register a new webhook endpoint. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = CreateSubscriptionSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Limit to 10 subscriptions per user
    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt FROM webhook_subscriptions WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    )
    if ((countRes.rows[0] as { cnt: number }).cnt >= 10) {
      return apiError('LIMIT_EXCEEDED', 'Maximum 10 active webhook subscriptions per account', 422)
    }

    const id = uuidv4()
    const secret = crypto.randomBytes(32).toString('hex') // 64-char hex HMAC secret

    await db.execute(
      `INSERT INTO webhook_subscriptions (id, user_id, url, secret, events, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::webhook_event_type[], TRUE, NOW(), NOW())`,
      [id, userId, parsed.data.url, secret, `{${parsed.data.events.join(',')}}`],
    )

    // Return secret only once — cannot be retrieved again
    return apiResponse({ id, url: parsed.data.url, events: parsed.data.events, secret, isActive: true }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/webhooks/subscriptions]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** DELETE /api/v1/webhooks/subscriptions — remove a subscription. */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const subId = request.nextUrl.searchParams.get('id')
  if (!subId) return apiError('VALIDATION_ERROR', 'id query param required', 422)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    await db.execute(
      `UPDATE webhook_subscriptions SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [subId, userId],
    )
    return apiResponse({ deactivated: true, id: subId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
