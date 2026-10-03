/**
 * @file ReviewService.ts
 * @description Review service — create, reveal, and list reviews.
 * Implements blind review mechanic: reviews stay pending until both
 * sides submit OR 14-day reveal window expires.
 * All rating values 1–5 (SMALLINT).
 *
 * @module domains/trust
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { NotFoundError, ConflictError, ForbiddenError } from '@/lib/errors/AppError'

/** Pending reviews are published after this many days even if only one side reviewed. */
export const REVEAL_AFTER_DAYS = 14

/* ── Types ──────────────────────────────────────────────────── */

export type CreateListingReviewInput = {
  bookingId: string
  reviewerUserId: string
  listingId: string
  overallRating: number
  ratingAccuracy?: number
  ratingReliability?: number
  ratingLocation?: number
  ratingValue?: number
  ratingCommunication?: number
  comment?: string
}

export type CreateDriverReviewInput = {
  bookingId: string
  reviewerUserId: string
  revieweeUserId: string
  overallRating: number
  ratingBehaviour?: number
  ratingTimeliness?: number
  comment?: string
}

export type ReviewRow = {
  id: string
  bookingId: string
  reviewerUserId: string
  subject: 'listing' | 'driver'
  overallRating: number
  comment: string | null
  status: string
  createdAt: Date
}

export type ListingReviewDisplay = ReviewRow & {
  listingId: string
  ratingAccuracy: number | null
  ratingReliability: number | null
  ratingLocation: number | null
  ratingValue: number | null
  ratingCommunication: number | null
  reviewerName: string | null
  reviewerAvatarUrl: string | null
}

/**
 * Review service.
 */
export const ReviewService = {

  /**
   * Creates a driver → listing review.
   * @throws {ConflictError} if driver already reviewed this booking
   */
  async createListingReview(input: CreateListingReviewInput): Promise<ReviewRow> {
    const db = await getDb()

    // Check booking exists and is completed
    const bookingRes = await db.execute(
      `SELECT b.id, b.status FROM bookings b
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE b.id = $1 AND dp.user_id = $2 LIMIT 1`,
      [input.bookingId, input.reviewerUserId],
    )
    if (bookingRes.rows.length === 0) throw new NotFoundError('Booking', input.bookingId)
    const booking = bookingRes.rows[0] as { id: string; status: string }
    if (booking.status !== 'completed') {
      throw new ConflictError('Reviews can only be submitted after a completed booking.', 'BOOKING_NOT_COMPLETED')
    }

    const reviewId = uuidv4()
    await db.execute(
      `INSERT INTO reviews (
         id, booking_id, reviewer_user_id, listing_id, subject,
         overall_rating, rating_accuracy, rating_reliability,
         rating_location, rating_value, rating_communication,
         comment, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,'listing',$5,$6,$7,$8,$9,$10,$11,'pending',NOW(),NOW())`,
      [
        reviewId, input.bookingId, input.reviewerUserId, input.listingId,
        input.overallRating,
        input.ratingAccuracy ?? null, input.ratingReliability ?? null,
        input.ratingLocation ?? null, input.ratingValue ?? null,
        input.ratingCommunication ?? null,
        input.comment ?? null,
      ],
    )

    // Check if host has already reviewed the driver → if so, reveal both
    await this._checkReveal(input.bookingId)

    return this.getById(reviewId)
  },

  /**
   * Creates a host → driver review.
   */
  async createDriverReview(input: CreateDriverReviewInput): Promise<ReviewRow> {
    const db = await getDb()

    // Verify host owns the listing in this booking
    const bookingRes = await db.execute(
      `SELECT b.id, b.status FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE b.id = $1 AND hp.user_id = $2 LIMIT 1`,
      [input.bookingId, input.reviewerUserId],
    )
    if (bookingRes.rows.length === 0) throw new ForbiddenError()
    const booking = bookingRes.rows[0] as { id: string; status: string }
    if (booking.status !== 'completed') {
      throw new ConflictError('Reviews can only be submitted after a completed booking.', 'BOOKING_NOT_COMPLETED')
    }

    const reviewId = uuidv4()
    await db.execute(
      `INSERT INTO reviews (
         id, booking_id, reviewer_user_id, reviewee_user_id, subject,
         overall_rating, rating_behaviour, rating_timeliness,
         comment, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,'driver',$5,$6,$7,$8,'pending',NOW(),NOW())`,
      [
        reviewId, input.bookingId, input.reviewerUserId, input.revieweeUserId,
        input.overallRating,
        input.ratingBehaviour ?? null, input.ratingTimeliness ?? null,
        input.comment ?? null,
      ],
    )

    await this._checkReveal(input.bookingId)
    return this.getById(reviewId)
  },

  /**
   * Returns published reviews for a listing.
   */
  async getForListing(listingId: string, page = 1, pageSize = 10): Promise<{
    reviews: ListingReviewDisplay[]; total: number; averageRating: number | null
  }> {
    const db = await getDb()
    const offset = (page - 1) * pageSize

    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS total, ROUND(AVG(overall_rating)::NUMERIC, 2) AS avg
       FROM reviews WHERE listing_id = $1 AND status = 'published' AND subject = 'listing'`,
      [listingId],
    )
    const { total, avg } = countRes.rows[0] as { total: number; avg: string | null }

    const res = await db.execute(
      `SELECT r.id, r.booking_id, r.reviewer_user_id, r.subject,
              r.overall_rating, r.rating_accuracy, r.rating_reliability,
              r.rating_location, r.rating_value, r.rating_communication,
              r.comment, r.status, r.created_at, r.listing_id,
              u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar_url
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_user_id
       WHERE r.listing_id = $1 AND r.status = 'published' AND r.subject = 'listing'
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [listingId, pageSize, offset],
    )

    const reviews = res.rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        id: r['id'] as string,
        bookingId: r['booking_id'] as string,
        reviewerUserId: r['reviewer_user_id'] as string,
        subject: 'listing' as const,
        overallRating: Number(r['overall_rating']),
        comment: (r['comment'] as string | null) ?? null,
        status: r['status'] as string,
        createdAt: new Date(r['created_at'] as string),
        listingId: r['listing_id'] as string,
        ratingAccuracy: r['rating_accuracy'] != null ? Number(r['rating_accuracy']) : null,
        ratingReliability: r['rating_reliability'] != null ? Number(r['rating_reliability']) : null,
        ratingLocation: r['rating_location'] != null ? Number(r['rating_location']) : null,
        ratingValue: r['rating_value'] != null ? Number(r['rating_value']) : null,
        ratingCommunication: r['rating_communication'] != null ? Number(r['rating_communication']) : null,
        reviewerName: (r['reviewer_name'] as string | null) ?? null,
        reviewerAvatarUrl: (r['reviewer_avatar_url'] as string | null) ?? null,
      } satisfies ListingReviewDisplay
    })

    return { reviews, total, averageRating: avg != null ? Number(avg) : null }
  },

  async getById(reviewId: string): Promise<ReviewRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, booking_id, reviewer_user_id, subject, overall_rating, comment, status, created_at
       FROM reviews WHERE id = $1 LIMIT 1`,
      [reviewId],
    )
    if (res.rows.length === 0) throw new NotFoundError('Review', reviewId)
    const r = res.rows[0] as Record<string, unknown>
    return {
      id: r['id'] as string,
      bookingId: r['booking_id'] as string,
      reviewerUserId: r['reviewer_user_id'] as string,
      subject: r['subject'] as 'listing' | 'driver',
      overallRating: Number(r['overall_rating']),
      comment: (r['comment'] as string | null) ?? null,
      status: r['status'] as string,
      createdAt: new Date(r['created_at'] as string),
    }
  },

  /**
   * Publishes reviews still pending after REVEAL_AFTER_DAYS — the case where the
   * other party never reviewed. Listing/host ratings are refreshed by the
   * trg_refresh_*_rating triggers. Called daily by the scheduler.
   */
  async revealStale(): Promise<{ revealed: number }> {
    const db = await getDb()
    const res = await db.execute(
      `UPDATE reviews
       SET status = 'published', revealed_at = NOW(), updated_at = NOW()
       WHERE status = 'pending' AND created_at < NOW() - make_interval(days => $1)
       RETURNING id`,
      [REVEAL_AFTER_DAYS],
    )
    return { revealed: res.rows.length }
  },

  /**
   * Checks if both sides of a booking have reviewed.
   * If so, reveals both reviews by setting status → published.
   */
  async _checkReveal(bookingId: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT COUNT(*)::INT AS cnt FROM reviews WHERE booking_id = $1 AND status = 'pending'`,
      [bookingId],
    )
    const count = (res.rows[0] as { cnt: number }).cnt
    if (count >= 2) {
      await db.execute(
        `UPDATE reviews SET status = 'published', revealed_at = NOW(), updated_at = NOW()
         WHERE booking_id = $1 AND status = 'pending'`,
        [bookingId],
      )
    }
  },
}
