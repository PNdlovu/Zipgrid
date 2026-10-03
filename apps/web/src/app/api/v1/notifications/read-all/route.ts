/**
 * @file route.ts
 * @description POST /api/v1/notifications/read-all
 * Marks every unread notification as read for the authenticated user.
 * Returns the count of notifications marked.
 *
 * @module apps/web/api/v1/notifications/read-all
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { NotificationService } from '@/domains/notifications/NotificationService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const count = await NotificationService.markAllRead(userId)
    return apiResponse({ markedRead: count })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** PATCH is accepted as an alias (the notifications page uses it). */
export const PATCH = POST
