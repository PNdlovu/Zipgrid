/**
 * @file route.ts
 * @description PATCH /api/v1/notifications/[id]/read — marks a single notification as read.
 *              GET  /api/v1/notifications/[id]       — returns a single notification.
 *
 * @module apps/web/api/v1/notifications/[id]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { NotificationService } from '@/domains/notifications/NotificationService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

/** GET /api/v1/notifications/[id] */
export async function GET(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    const notification = await NotificationService.getById(id)
    // Ownership check — notification.userId must match
    if ((notification as { userId: string }).userId !== userId) {
      return apiError('FORBIDDEN', 'Not your notification', 403)
    }
    return apiResponse(notification)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** PATCH /api/v1/notifications/[id] — marks notification as read */
export async function PATCH(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    await NotificationService.markRead(id, userId)
    return apiResponse({ read: true, notificationId: id })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
