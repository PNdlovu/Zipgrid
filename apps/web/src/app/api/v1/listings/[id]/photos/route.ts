/**
 * @file route.ts
 * @description POST/DELETE /api/v1/listings/[id]/photos
 *
 * POST   — uploads a photo to Vercel Blob, records URL in listing_photos.
 *          Accepts multipart/form-data with field "photo" (image file).
 * DELETE — removes a photo by ?photoId= query param.
 *
 * Photo rules:
 *   - Max 8 photos per listing
 *   - Max 8 MB per file
 *   - Accepted types: image/jpeg, image/png, image/webp
 *   - First photo uploaded automatically becomes cover
 *
 * Vercel Blob is used for storage (BLOB_READ_WRITE_TOKEN env var).
 * In development (no token), files are rejected with a clear error.
 *
 * @module apps/web/api/v1/listings/[id]/photos
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const MAX_PHOTOS     = 8
const MAX_BYTES      = 8 * 1024 * 1024 // 8 MB
const ALLOWED_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp'])

type Params = { params: Promise<{ id: string }> }

/** POST /api/v1/listings/[id]/photos */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id: listingId } = await params

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership
    const ownerRes = await db.execute(
      `SELECT cl.id FROM charger_listings cl
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE cl.id = $1 AND hp.user_id = $2 LIMIT 1`,
      [listingId, userId],
    )
    if (ownerRes.rows.length === 0) {
      return apiError('FORBIDDEN', 'You do not own this listing', 403)
    }

    // Check existing photo count
    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt FROM listing_photos WHERE listing_id = $1`,
      [listingId],
    )
    const photoCount = (countRes.rows[0] as { cnt: number }).cnt
    if (photoCount >= MAX_PHOTOS) {
      return apiError('LIMIT_REACHED', `Maximum ${MAX_PHOTOS} photos per listing.`, 400)
    }

    // Parse multipart form
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError('INVALID_FORM', 'Expected multipart/form-data', 400)
    }

    const file = formData.get('photo') as File | null
    if (!file || !(file instanceof File)) {
      return apiError('MISSING_FILE', "Form field 'photo' is required", 400)
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return apiError('INVALID_TYPE', 'Photo must be JPEG, PNG, or WebP', 400)
    }
    if (file.size > MAX_BYTES) {
      return apiError('FILE_TOO_LARGE', 'Photo must be under 8 MB', 400)
    }

    // Upload to Vercel Blob
    const blobToken = process.env['BLOB_READ_WRITE_TOKEN']
    if (!blobToken) {
      // Dev environment — no Blob configured
      if (process.env.NODE_ENV === 'production') {
        return apiError('STORAGE_UNAVAILABLE', 'Photo storage is not configured', 503)
      }
      // In dev: store a placeholder URL so the flow can be tested
      const devUrl = `https://dev-placeholder.zipgrid.internal/${listingId}/${uuidv4()}.jpg`
      const isCover = photoCount === 0
      const photoId = uuidv4()
      await db.execute(
        `INSERT INTO listing_photos (id, listing_id, cdn_url, is_cover, display_order, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [photoId, listingId, devUrl, isCover, photoCount],
      )
      return apiResponse({ photoId, url: devUrl, isCover }, undefined, 201)
    }

    // Build Vercel Blob pathname: listings/<listingId>/<uuid>.<ext>
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const pathname = `listings/${listingId}/${uuidv4()}.${ext}`

    const blobRes = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${blobToken}`,
        'x-content-type': file.type,
        'x-cache-control-max-age': '31536000', // 1 year CDN cache
      },
      body: file.stream(),
    })

    if (!blobRes.ok) {
      const errText = await blobRes.text()
      console.error('[photos/upload] Vercel Blob error:', errText)
      return apiError('UPLOAD_FAILED', 'Photo upload failed — please try again', 502)
    }

    const blobData = (await blobRes.json()) as { url: string }
    const photoUrl = blobData.url

    // Insert photo record
    const isCover  = photoCount === 0
    const photoId  = uuidv4()
    await db.execute(
      `INSERT INTO listing_photos (id, listing_id, cdn_url, is_cover, display_order, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [photoId, listingId, photoUrl, isCover, photoCount],
    )

    return apiResponse({ photoId, url: photoUrl, isCover }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/listings/[id]/photos]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** DELETE /api/v1/listings/[id]/photos?photoId=<uuid> */
export async function DELETE(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id: listingId } = await params
  const photoId = request.nextUrl.searchParams.get('photoId')
  if (!photoId) return apiError('MISSING_PARAM', 'photoId query param is required', 400)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership
    const ownerRes = await db.execute(
      `SELECT cl.id FROM charger_listings cl
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE cl.id = $1 AND hp.user_id = $2 LIMIT 1`,
      [listingId, userId],
    )
    if (ownerRes.rows.length === 0) {
      return apiError('FORBIDDEN', 'You do not own this listing', 403)
    }

    // Get photo to check existence and cover status
    const photoRes = await db.execute(
      `SELECT id, is_cover, cdn_url FROM listing_photos
       WHERE id = $1 AND listing_id = $2 LIMIT 1`,
      [photoId, listingId],
    )
    if (photoRes.rows.length === 0) {
      return apiError('NOT_FOUND', 'Photo not found', 404)
    }

    const photo = photoRes.rows[0] as { id: string; is_cover: boolean; cdn_url: string }

    // Delete from DB
    await db.execute(`DELETE FROM listing_photos WHERE id = $1`, [photoId])

    // If we deleted the cover photo, promote the next photo to cover
    if (photo.is_cover) {
      await db.execute(
        `UPDATE listing_photos
         SET is_cover = TRUE
         WHERE listing_id = $1
           AND id = (SELECT id FROM listing_photos WHERE listing_id = $1 ORDER BY display_order ASC LIMIT 1)`,
        [listingId],
      )
    }

    // Best-effort: delete from Vercel Blob
    const blobToken = process.env['BLOB_READ_WRITE_TOKEN']
    if (blobToken && photo.cdn_url.includes('vercel-storage.com')) {
      await fetch(photo.cdn_url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${blobToken}` },
      }).catch(() => { /* non-fatal */ })
    }

    return apiResponse({ deleted: true, photoId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
