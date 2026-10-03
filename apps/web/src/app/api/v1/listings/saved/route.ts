/**
 * @file route.ts
 * @description GET/POST/DELETE /api/v1/listings/saved — driver saved/favourite listings.
 *
 * GET  — list all saved listings for the authenticated driver
 * POST { listingId } — save a listing
 * DELETE ?listingId= — remove a saved listing
 *
 * @module apps/web/api/v1/listings/saved
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/listings/saved — list all saved listings for the authenticated driver. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `SELECT
         sl.listing_id,
         sl.created_at AS saved_at,
         cl.title, cl.city, cl.address_line1,
         cl.charger_level, cl.max_power_kw, cl.plug_types,
         cl.price_per_kwh_cents AS price_per_kwh_pence, cl.price_per_hour_cents AS price_per_hour_pence,
         cl.average_rating, cl.review_count,
         cl.status AS listing_status,
         ss.overall_score AS safety_score,
         (SELECT cdn_url FROM listing_photos lp WHERE lp.listing_id = cl.id AND lp.is_cover = TRUE LIMIT 1) AS cover_url
       FROM saved_listings sl
       JOIN charger_listings cl ON cl.id = sl.listing_id
       LEFT JOIN safety_scores ss ON ss.listing_id = cl.id
       WHERE sl.user_id = $1
       ORDER BY sl.created_at DESC
       LIMIT 100`,
      [userId],
    )

    return apiResponse({ savedListings: res.rows })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not fetch saved listings', 500)
  }
}

/** POST /api/v1/listings/saved — save a listing. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: { listingId: string }
  try {
    body = z.object({ listingId: z.string().uuid() }).parse(await request.json())
  } catch { return apiError('VALIDATION_ERROR', 'listingId (UUID) is required', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    await db.execute(
      `INSERT INTO saved_listings (id, user_id, listing_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, listing_id) DO NOTHING`,
      [crypto.randomUUID(), userId, body.listingId],
    )

    return apiResponse({ saved: true, listingId: body.listingId }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not save listing', 500)
  }
}

/** DELETE /api/v1/listings/saved — remove a saved listing. */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const listingId = request.nextUrl.searchParams.get('listingId')
  if (!listingId) return apiError('VALIDATION_ERROR', 'listingId query parameter required', 400)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    await db.execute(
      `DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
      [userId, listingId],
    )

    return apiResponse({ removed: true, listingId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not remove saved listing', 500)
  }
}
