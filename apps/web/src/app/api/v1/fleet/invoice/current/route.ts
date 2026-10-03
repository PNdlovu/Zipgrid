/**
 * @file route.ts
 * @description GET /api/v1/fleet/invoice/current
 * Returns a CSV/text invoice for the current month's fleet usage.
 * Fleet admin only.
 *
 * @module apps/web/api/v1/fleet/invoice/current
 */

import { type NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/response'
import { AppError, ForbiddenError } from '@/lib/errors/AppError'

/** GET /api/v1/fleet/invoice/current — Returns a CSV/text invoice for the current month's fleet usage. */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const adminRes = await db.execute(
      `SELECT fm.fleet_account_id, fa.company_name
       FROM fleet_members fm
       JOIN fleet_accounts fa ON fa.id = fm.fleet_account_id
       WHERE fm.user_id = $1 AND fm.role = 'fleet_admin' AND fm.status = 'active' LIMIT 1`,
      [userId],
    )
    if (adminRes.rows.length === 0) throw new ForbiddenError('Fleet admin access required')
    const { fleet_account_id: fleetId, company_name: companyName } = adminRes.rows[0] as { fleet_account_id: string; company_name: string }

    // Fetch this month's sessions for all fleet drivers
    const sessionsRes = await db.execute(
      `SELECT
         u.full_name AS driver_name,
         u.email AS driver_email,
         cl.title AS charger,
         cl.city,
         cs.started_at,
         cs.ended_at,
         ROUND((cs.energy_consumed_wh / 1000.0)::NUMERIC, 2) AS energy_kwh,
         ROUND((COALESCE(t.total_charged_cents, 0) / 100.0)::NUMERIC, 2) AS total_gbp,
         ROUND((COALESCE(t.tax_cents, 0) / 100.0)::NUMERIC, 2) AS vat_gbp
       FROM fleet_members fm
       JOIN driver_profiles dp ON dp.user_id = fm.user_id
       JOIN users u ON u.id = dp.user_id
       JOIN bookings b ON b.driver_profile_id = dp.id
         AND b.status = 'completed'
         AND b.completed_at >= DATE_TRUNC('month', NOW())
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN charging_sessions cs ON cs.booking_id = b.id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE fm.fleet_account_id = $1
       ORDER BY cs.started_at DESC`,
      [fleetId],
    )

    const now = new Date()
    const period = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    const invoiceNo = `ZG-FLT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

    type Row = { driver_name: string; driver_email: string; charger: string; city: string; started_at: string; ended_at: string; energy_kwh: string; total_gbp: string; vat_gbp: string }
    const rows = sessionsRes.rows as Row[]

    const totalGbp = rows.reduce((s, r) => s + parseFloat(r.total_gbp || '0'), 0)
    const totalVat  = rows.reduce((s, r) => s + parseFloat(r.vat_gbp  || '0'), 0)

    // Build CSV invoice
    const lines = [
      `ZIPGRID FLEET INVOICE`,
      `Invoice No: ${invoiceNo}`,
      `Period: ${period}`,
      `Company: ${companyName}`,
      `Generated: ${now.toLocaleDateString('en-GB')}`,
      ``,
      `Driver,Email,Charger,City,Start,End,kWh,Total (£),VAT (£)`,
      ...rows.map((r) => [
        r.driver_name, r.driver_email, r.charger, r.city,
        new Date(r.started_at).toLocaleString('en-GB'),
        new Date(r.ended_at ?? r.started_at).toLocaleString('en-GB'),
        r.energy_kwh, r.total_gbp, r.vat_gbp,
      ].map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')),
      ``,
      `TOTAL,,,,,,, ${totalGbp.toFixed(2)}, ${totalVat.toFixed(2)}`,
    ]

    const csv = lines.join('\n')
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${invoiceNo}.csv"`,
      },
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[fleet/invoice/current]', err)
    return apiError('INTERNAL_ERROR', 'Could not generate invoice', 500)
  }
}
