/**
 * @file route.ts
 * @description GET/PUT /api/v1/listings/[id]/schedule — weekly availability schedule.
 *
 * @module apps/web/api/v1/listings/[id]/schedule
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AvailabilityService, assertListingOwner } from '@/domains/charging/AvailabilityService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

const ScheduleSchema = z.object({
  schedule: z.array(z.object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    openTime: z.string().regex(/^\d{2}:\d{2}$/),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/),
    isAvailable: z.boolean(),
  })),
})

/** GET /api/v1/listings/[id]/schedule */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const schedule = await AvailabilityService.getSchedule(id)
    return apiResponse(schedule)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** PUT /api/v1/listings/[id]/schedule */
export async function PUT(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = ScheduleSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  try {
    await assertListingOwner(id, userId)
    await AvailabilityService.setSchedule(id, parsed.data.schedule)
    return apiResponse({ updated: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
