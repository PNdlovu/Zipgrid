/**
 * @file route.ts
 * @description POST /api/v1/admin/payouts — triggers the weekly payout batch.
 *              GET  /api/v1/admin/payouts — returns payout batch summary.
 *
 * POST flow:
 *   1. Determines the period (last Monday 00:00 → this Monday 00:00 UTC)
 *   2. Calls PayoutService.schedulePayouts() to create pending payout_batches rows
 *   3. Calls PayoutService.processPayouts() to execute Stripe Connect transfers
 *   4. Returns { scheduled, processed, failed } counts
 *
 * This endpoint is designed to be called by:
 *   - pg_cron or Railway cron every Monday 08:00 UTC
 *   - Admin manually from the admin dashboard
 *
 * @module apps/web/api/v1/admin/payouts
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { PayoutService } from '@/domains/payments/PayoutService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

function requireAdmin(req: NextRequest): boolean {
  return (req.headers.get('x-user-roles') ?? '')
    .split(',')
    .map((r) => r.trim())
    .includes('admin')
}

/**
 * Returns the start and end of the previous Mon–Sun week (UTC).
 * If today is Monday, covers last week. Otherwise covers the week before last Monday.
 */
function getLastWeekPeriod(): { periodStart: Date; periodEnd: Date } {
  const now = new Date()
  // Find the most recent Monday at 00:00 UTC
  const dayOfWeek = now.getUTCDay()              // 0=Sun, 1=Mon … 6=Sat
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(now)
  thisMonday.setUTCDate(now.getUTCDate() - daysToLastMonday)
  thisMonday.setUTCHours(0, 0, 0, 0)

  const lastMonday = new Date(thisMonday)
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7)

  return { periodStart: lastMonday, periodEnd: thisMonday }
}

/* ── GET — payout status overview ─────────────────────────── */

export async function GET(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const [pendingRes, recentRes] = await Promise.all([
      db.execute(
        `SELECT COUNT(*)::INT AS pending_count,
                COALESCE(SUM(net_earnings_pence), 0)::INT AS pending_pence
         FROM payout_batches WHERE status = 'pending'`,
        [],
      ),
      db.execute(
        `SELECT id, host_user_id, period_start, period_end,
                net_earnings_pence, status, processed_at, stripe_transfer_id
         FROM payout_batches
         ORDER BY created_at DESC LIMIT 20`,
        [],
      ),
    ])

    const pending = pendingRes.rows[0] as { pending_count: number; pending_pence: number }

    return apiResponse({
      pendingBatches: pending.pending_count,
      pendingTotalPence: pending.pending_pence,
      recentBatches: recentRes.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          id:               row['id'],
          hostUserId:       row['host_user_id'],
          periodStart:      row['period_start'],
          periodEnd:        row['period_end'],
          netEarningsPence: Number(row['net_earnings_pence']),
          status:           row['status'],
          processedAt:      row['processed_at'],
          stripeTransferId: row['stripe_transfer_id'],
        }
      }),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/admin/payouts]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/* ── POST — run payout batch ──────────────────────────────── */

export async function POST(request: NextRequest) {
  if (!requireAdmin(request)) return apiError('FORBIDDEN', 'Admin access required', 403)

  // Allow overriding the period via body for testing / retroactive payouts
  let body: { periodStart?: string; periodEnd?: string } = {}
  try {
    const raw = await request.text()
    if (raw) body = JSON.parse(raw) as { periodStart?: string; periodEnd?: string }
  } catch {
    // No body or invalid JSON — use default period
  }

  try {
    const { periodStart, periodEnd } = body.periodStart && body.periodEnd
      ? {
          periodStart: new Date(body.periodStart),
          periodEnd:   new Date(body.periodEnd),
        }
      : getLastWeekPeriod()

    // Validate period
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return apiError('VALIDATION_ERROR', 'Invalid periodStart or periodEnd', 422)
    }
    if (periodEnd <= periodStart) {
      return apiError('VALIDATION_ERROR', 'periodEnd must be after periodStart', 422)
    }

    // Step 1: Schedule — create payout_batches rows for eligible hosts
    const scheduled = await PayoutService.schedulePayouts(periodStart, periodEnd)

    // Step 2: Process — execute Stripe Connect transfers for all pending batches
    const { processed, failed } = await PayoutService.processPayouts()

    return apiResponse({
      period: {
        start: periodStart.toISOString(),
        end:   periodEnd.toISOString(),
      },
      scheduled,
      processed,
      failed,
      message: `Payout run complete. ${scheduled} host(s) scheduled, ${processed} paid, ${failed} failed.`,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/admin/payouts]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
