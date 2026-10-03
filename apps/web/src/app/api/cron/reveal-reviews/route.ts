/**
 * @file route.ts
 * @description GET /api/cron/reveal-reviews — auto-reveal stale pending reviews.
 *
 * Reviews are created with status='pending' and use a blind mechanic: both sides
 * must submit before either review is revealed. If only one side submits within
 * 14 days, this job auto-publishes the pending review(s) so they're not lost.
 *
 * Intended to be called by a scheduled job (Vercel Cron, pg_cron, etc.) daily.
 * Secured with CRON_SECRET header to prevent public invocation.
 *
 * @module apps/web/api/cron/reveal-reviews
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import { hasValidServiceSecret } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Guard: require CRON_SECRET header so only the scheduler can trigger this
  if (!hasValidServiceSecret(request.headers, 'CRON_SECRET', 'x-cron-secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Reveal all pending reviews older than 14 days
    // The blind mechanic already publishes on mutual submission; this handles
    // the one-sided case where the other party never responds.
    const result = await db.execute(
      `UPDATE reviews
       SET status = 'published',
           revealed_at = NOW(),
           updated_at  = NOW()
       WHERE status = 'pending'
         AND created_at < NOW() - INTERVAL '14 days'
       RETURNING id, booking_id`,
      [],
    )

    const revealed = result.rows as Array<{ id: string; booking_id: string }>

    // For each booking that had reviews revealed, recompute the listing's average rating
    // by finding unique listing IDs via the bookings table and triggering a rating refresh.
    if (revealed.length > 0) {
      const bookingIds = [...new Set(revealed.map((r) => r.booking_id))]

      // Bulk-update average_rating on charger_listings for affected listings
      await db.execute(
        `UPDATE charger_listings cl
         SET average_rating = (
           SELECT ROUND(AVG(r.overall_rating)::NUMERIC, 2)
           FROM reviews r
           WHERE r.listing_id = cl.id AND r.status = 'published' AND r.subject = 'listing'
         ),
         review_count = (
           SELECT COUNT(*)::INT
           FROM reviews r
           WHERE r.listing_id = cl.id AND r.status = 'published' AND r.subject = 'listing'
         ),
         updated_at = NOW()
         WHERE cl.id IN (
           SELECT DISTINCT b.listing_id
           FROM bookings b
           WHERE b.id = ANY($1::uuid[])
         )`,
        [bookingIds],
      )
    }

    console.info(`[cron/reveal-reviews] Revealed ${revealed.length} review(s)`)

    return NextResponse.json({
      success: true,
      revealed: revealed.length,
      ids: revealed.map((r) => r.id),
    })
  } catch (err) {
    console.error('[cron/reveal-reviews]', err)
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
