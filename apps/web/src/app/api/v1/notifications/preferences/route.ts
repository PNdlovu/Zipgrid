/**
 * @file route.ts
 * @description GET/PATCH /api/v1/notifications/preferences
 * Manages per-user notification delivery preferences.
 *
 * @module apps/web/api/v1/notifications/preferences
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { NotificationService } from '@/domains/notifications/NotificationService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const PatchSchema = z.object({
  emailEnabled:        z.boolean().optional(),
  smsEnabled:          z.boolean().optional(),
  pushEnabled:         z.boolean().optional(),
  categoriesDisabled:  z.array(z.string()).optional(),
})

/** GET /api/v1/notifications/preferences */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const prefs = await NotificationService.getPreferences(userId)
    return apiResponse(prefs)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** PATCH /api/v1/notifications/preferences */
export async function PATCH(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    // Strip undefined keys to satisfy exactOptionalPropertyTypes
    const updates: Parameters<typeof NotificationService.updatePreferences>[1] = {}
    if (parsed.data.emailEnabled !== undefined) updates.emailEnabled = parsed.data.emailEnabled
    if (parsed.data.smsEnabled !== undefined) updates.smsEnabled = parsed.data.smsEnabled
    if (parsed.data.pushEnabled !== undefined) updates.pushEnabled = parsed.data.pushEnabled
    if (parsed.data.categoriesDisabled !== undefined) updates.categoriesDisabled = parsed.data.categoriesDisabled
    await NotificationService.updatePreferences(userId, updates)
    const prefs = await NotificationService.getPreferences(userId)
    return apiResponse(prefs)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
