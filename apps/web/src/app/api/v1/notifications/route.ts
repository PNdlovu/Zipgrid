/**
 * @file route.ts
 * @description POST /api/v1/notifications — internal endpoint used by ai-service
 * and other internal services to queue notifications.
 *
 * GET /api/v1/notifications — authenticated user's notification feed.
 *
 * @module apps/web/api/v1/notifications
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const CreateNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  actionUrl: z.string().optional(),
  data: z.record(z.unknown()).optional(),
})

/** POST /api/v1/notifications — internal service-to-service use */
export async function POST(request: NextRequest) {
  // Accept either x-user-id (direct client) or X-Service-Secret (internal)
  const serviceSecret = request.headers.get('x-service-secret')
  const configuredSecret = process.env.AI_SERVICE_SECRET ?? ''
  const isServiceCall = configuredSecret && serviceSecret === configuredSecret
  const userId = request.headers.get('x-user-id')

  if (!isServiceCall && !userId) {
    return apiError('UNAUTHORIZED', 'Authentication required', 401)
  }

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = CreateNotificationSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const notifId = uuidv4()
    await db.execute(
      `INSERT INTO notifications (
         id, user_id, channel, type, title, body, action_url,
         delivery_status, created_at, scheduled_for
       ) VALUES ($1,$2,'in_app',$3,$4,$5,$6,'queued',NOW(),NOW())`,
      [
        notifId,
        parsed.data.userId,
        parsed.data.type,
        parsed.data.title,
        parsed.data.body,
        parsed.data.actionUrl ?? null,
      ],
    )

    return apiResponse({ notificationId: notifId }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/notifications]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** GET /api/v1/notifications — current user's notification feed */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const unreadOnly = searchParams.get('unread') === 'true'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))
  const offset = (page - 1) * pageSize

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const conditions = [`user_id = $1`, `channel = 'in_app'`]
    if (unreadOnly) conditions.push(`read_at IS NULL`)
    const where = conditions.join(' AND ')

    const [countRes, notifRes] = await Promise.all([
      db.execute(`SELECT COUNT(*)::INT AS total FROM notifications WHERE ${where}`, [userId]),
      db.execute(
        `SELECT id, type, title, body, action_url, read_at, delivery_status, created_at
         FROM notifications
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      ),
    ])

    const total = (countRes.rows[0] as { total: number }).total
    return apiResponse(notifRes.rows, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
