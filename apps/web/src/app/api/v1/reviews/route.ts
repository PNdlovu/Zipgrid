/**
 * @file route.ts
 * @description POST /api/v1/reviews — submit a review after a completed booking.
 *              GET  /api/v1/reviews?listingId=xxx — published reviews for a listing.
 *              GET  /api/v1/reviews?bookingId=xxx — check if the current user has already
 *                   reviewed a booking (returns { reviewed: boolean }).
 * @module apps/web/api/v1/reviews
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ReviewService } from '@/domains/trust/ReviewService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const RatingSchema = z.number().int().min(1).max(5)

const PostReviewSchema = z.discriminatedUnion('subject', [
  z.object({
    subject: z.literal('listing'),
    bookingId: z.string().uuid(),
    listingId: z.string().uuid(),
    overallRating: RatingSchema,
    ratingAccuracy: RatingSchema.optional(),
    ratingReliability: RatingSchema.optional(),
    ratingLocation: RatingSchema.optional(),
    ratingValue: RatingSchema.optional(),
    ratingCommunication: RatingSchema.optional(),
    comment: z.string().max(2000).optional(),
  }),
  z.object({
    subject: z.literal('driver'),
    bookingId: z.string().uuid(),
    revieweeUserId: z.string().uuid(),
    overallRating: RatingSchema,
    ratingBehaviour: RatingSchema.optional(),
    ratingTimeliness: RatingSchema.optional(),
    comment: z.string().max(2000).optional(),
  }),
])

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = PostReviewSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)

  try {
    const review = parsed.data.subject === 'listing'
      ? await ReviewService.createListingReview({
          bookingId: parsed.data.bookingId,
          reviewerUserId: userId,
          listingId: parsed.data.listingId,
          overallRating: parsed.data.overallRating,
          ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
          ...(parsed.data.ratingAccuracy !== undefined ? { ratingAccuracy: parsed.data.ratingAccuracy } : {}),
          ...(parsed.data.ratingReliability !== undefined ? { ratingReliability: parsed.data.ratingReliability } : {}),
          ...(parsed.data.ratingLocation !== undefined ? { ratingLocation: parsed.data.ratingLocation } : {}),
          ...(parsed.data.ratingValue !== undefined ? { ratingValue: parsed.data.ratingValue } : {}),
          ...(parsed.data.ratingCommunication !== undefined ? { ratingCommunication: parsed.data.ratingCommunication } : {}),
        })
      : await ReviewService.createDriverReview({
          bookingId: parsed.data.bookingId,
          reviewerUserId: userId,
          revieweeUserId: parsed.data.revieweeUserId,
          overallRating: parsed.data.overallRating,
          ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
          ...(parsed.data.ratingBehaviour !== undefined ? { ratingBehaviour: parsed.data.ratingBehaviour } : {}),
          ...(parsed.data.ratingTimeliness !== undefined ? { ratingTimeliness: parsed.data.ratingTimeliness } : {}),
        })
    return apiResponse(review, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/reviews]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const listingId  = searchParams.get('listingId')
  const bookingId  = searchParams.get('bookingId')

  // ── bookingId check: has this user already reviewed this booking? ──
  if (bookingId) {
    const userId = request.headers.get('x-user-id')
    if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
    try {
      const { getDb } = await import('@/lib/db')
      const db = await getDb()
      const res = await db.execute(
        `SELECT id FROM reviews
         WHERE booking_id = $1 AND reviewer_user_id = $2
         LIMIT 1`,
        [bookingId, userId],
      )
      return apiResponse({ reviewed: res.rows.length > 0 })
    } catch (err) {
      if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
      return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
    }
  }

  // ── listingId: paginated published reviews for a listing ──
  if (!listingId) {
    return apiError('VALIDATION_ERROR', 'listingId or bookingId query param required', 422)
  }
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, parseInt(searchParams.get('pageSize') ?? '10', 10))

  try {
    const result = await ReviewService.getForListing(listingId, page, pageSize)
    return apiResponse(result, { page, pageSize, total: result.total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
