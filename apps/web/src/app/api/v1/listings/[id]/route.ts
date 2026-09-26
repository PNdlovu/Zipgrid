/**
 * @file route.ts
 * @description GET/PATCH/DELETE /api/v1/listings/[id]
 *
 * @module apps/web/api/v1/listings/[id]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ListingService } from '@/domains/charging/ListingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

/** GET /api/v1/listings/[id] — public listing detail */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const listing = await ListingService.getById(id)
    return apiResponse(listing)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const UpdateListingSchema = z.object({
  title: z.string().min(5).max(120).optional(),
  description: z.string().max(2000).optional(),
  pricePerKwhPence: z.number().int().nonnegative().optional(),
  pricePerHourPence: z.number().int().nonnegative().optional(),
  idleFeePerMinPence: z.number().int().nonnegative().optional(),
  instantBookEnabled: z.boolean().optional(),
  accessInstructions: z.string().max(1000).optional(),
}).strict()

/** PATCH /api/v1/listings/[id] — update listing fields */
export async function PATCH(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = UpdateListingSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const db = (await import('@/lib/db')).getDb
    const dbInstance = await db()
    const listing = await ListingService.getById(id)
    const ownerCheck = await dbInstance.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, listing.hostProfileId],
    )
    if (ownerCheck.rows.length === 0) return apiError('FORBIDDEN', 'Not your listing', 403)

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1

    for (const [key, val] of Object.entries(parsed.data)) {
      if (val === undefined) continue
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      sets.push(`${col} = $${i++}`)
      vals.push(val)
    }
    if (sets.length === 0) return apiResponse({ updated: false })

    sets.push(`updated_at = NOW()`)
    vals.push(id)
    await dbInstance.execute(`UPDATE charger_listings SET ${sets.join(', ')} WHERE id = $${i}`, vals)
    const updated = await ListingService.getById(id)
    return apiResponse(updated)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** DELETE /api/v1/listings/[id] — deactivate listing */
export async function DELETE(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    const db = await (await import('@/lib/db')).getDb()
    const listing = await ListingService.getById(id)
    const ownerCheck = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, listing.hostProfileId],
    )
    if (ownerCheck.rows.length === 0) return apiError('FORBIDDEN', 'Not your listing', 403)
    await db.execute(
      `UPDATE charger_listings SET status = 'deactivated', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    return apiResponse({ deleted: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
