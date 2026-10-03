/**
 * @file route.ts
 * @description GET /api/v1/marketplace/vendor/dashboard — sales KPIs and the
 * order queue for the signed-in vendor. 404 when the user has no vendor profile.
 *
 * Order statuses are reported in the dashboard's vocabulary:
 *   payment_authorised/pending → hold_placed (awaiting fulfilment / release)
 *   confirmed/shipped/delivered → completed (payment captured)
 *   cancelled/refunded → cancelled
 *
 * @module apps/web/api/v1/marketplace/vendor/dashboard
 */

import { type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const UI_STATUS: Record<string, string> = {
  pending: 'hold_placed',
  payment_authorised: 'hold_placed',
  confirmed: 'completed',
  shipped: 'completed',
  delivered: 'completed',
  cancelled: 'cancelled',
  refunded: 'cancelled',
}

/** GET /api/v1/marketplace/vendor/dashboard — sales KPIs and the order queue for the signed-in vendor. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const db = await getDb()
    const vendorRes = await db.execute(`SELECT id FROM vendor_profiles WHERE user_id = $1`, [userId])
    const vendorId = vendorRes.rows[0]?.['id'] as string | undefined
    if (!vendorId) return apiError('NOT_A_VENDOR', 'You do not have a vendor account.', 404)

    const [statsRes, productsRes, ordersRes] = await Promise.all([
      db.execute(
        `SELECT
           COALESCE(SUM(li.total_price_pence) FILTER (WHERE o.status IN ('confirmed','shipped','delivered')), 0)::BIGINT AS total_sales,
           COALESCE(SUM(li.vendor_net_pence) FILTER (WHERE o.status IN ('confirmed','shipped','delivered')), 0)::BIGINT AS pending_payout,
           COUNT(DISTINCT o.id) FILTER (WHERE o.created_at >= date_trunc('month', NOW()))::INT AS orders_this_month
         FROM order_line_items li JOIN orders o ON o.id = li.order_id
         WHERE li.vendor_id = $1`,
        [vendorId],
      ),
      db.execute(
        `SELECT COUNT(*) FILTER (WHERE status = 'active')::INT AS active_products,
                AVG(average_rating) FILTER (WHERE review_count > 0) AS average_rating,
                COALESCE(SUM(review_count), 0)::INT AS review_count
         FROM products WHERE vendor_profile_id = $1`,
        [vendorId],
      ),
      db.execute(
        `SELECT o.id, o.status, o.created_at, li.quantity, li.total_price_pence,
                p.name AS product_name, u.email AS buyer_email
         FROM order_line_items li
         JOIN orders o   ON o.id = li.order_id
         JOIN products p ON p.id = li.product_id
         JOIN users u    ON u.id = o.buyer_user_id
         WHERE li.vendor_id = $1
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [vendorId],
      ),
    ])

    const s = statsRes.rows[0] ?? {}
    const p = productsRes.rows[0] ?? {}
    return apiResponse({
      stats: {
        totalSalesPence: Number(s['total_sales'] ?? 0),
        pendingPayoutPence: Number(s['pending_payout'] ?? 0),
        ordersThisMonth: Number(s['orders_this_month'] ?? 0),
        averageRating: p['average_rating'] != null ? Number(p['average_rating']) : null,
        reviewCount: Number(p['review_count'] ?? 0),
        activeProducts: Number(p['active_products'] ?? 0),
      },
      orders: ordersRes.rows.map((o) => ({
        id: o['id'],
        productName: o['product_name'],
        buyerEmail: o['buyer_email'],
        quantityOrdered: Number(o['quantity']),
        totalPence: Number(o['total_price_pence']),
        status: UI_STATUS[o['status'] as string] ?? (o['status'] as string),
        createdAt: o['created_at'],
        requestedDate: null,
        notes: null,
      })),
    })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/marketplace/vendor/dashboard')
  }
}
