/**
 * @file route.ts
 * @description GET /api/v1/host/vat-invoice?period=YYYY-MM
 * Generates a VAT invoice as a CSV (and HTML for PDF rendering) for the
 * specified month. Returns the invoice as a downloadable file.
 *
 * UK VAT: 20% on electricity supply. Net = gross / 1.2. VAT = gross - net.
 *
 * @module apps/web/api/v1/host/vat-invoice
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { planGate } from '@/lib/api/plan-gate'

const VAT_RATE = 0.20   // UK standard rate

/** GET /api/v1/host/vat-invoice — generate and download a host VAT invoice */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const blocked = await planGate(userId, 'vat_invoices')
  if (blocked) return blocked

  const period = request.nextUrl.searchParams.get('period') // e.g. 2026-09
  const format = (request.nextUrl.searchParams.get('format') ?? 'csv') as 'csv' | 'html'

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return apiError('VALIDATION_ERROR', 'period must be YYYY-MM format', 400)
  }

  const [year, month] = period.split('-')
  const fromTs = `${period}-01T00:00:00Z`
  const nextMonth = new Date(parseInt(year!), parseInt(month!), 1)
  const toTs = nextMonth.toISOString().split('T')[0] + 'T00:00:00Z'

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const hostRes = await db.execute(
      `SELECT hp.id, u.full_name, u.email, hp.business_name, hp.vat_number
       FROM host_profiles hp JOIN users u ON u.id = hp.user_id
       WHERE hp.user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)
    const host = hostRes.rows[0] as {
      id: string; full_name: string; email: string
      business_name: string | null; vat_number: string | null
    }

    const sessionsRes = await db.execute(
      `SELECT
         b.id AS booking_id,
         cs.started_at,
         cs.ended_at,
         cl.title AS charger_name,
         ROUND((cs.energy_consumed_wh / 1000.0)::NUMERIC, 3) AS energy_kwh,
         COALESCE(t.total_charged_cents, 0) AS gross_pence,
         ROUND((COALESCE(t.total_charged_cents, 0) / (1 + $4::NUMERIC))::NUMERIC, 0) AS net_pence,
         ROUND((COALESCE(t.total_charged_cents, 0) - COALESCE(t.total_charged_cents, 0) / (1 + $4::NUMERIC))::NUMERIC, 0) AS vat_pence,
         COALESCE(t.host_earnings_cents, 0) AS host_earnings_pence
       FROM bookings b
       JOIN charger_listings cl ON cl.id = b.listing_id
       JOIN charging_sessions cs ON cs.booking_id = b.id
       LEFT JOIN transactions t ON t.booking_id = b.id
       WHERE cl.host_profile_id = $1
         AND b.completed_at >= $2 AND b.completed_at < $3
         AND b.status = 'completed'
       ORDER BY cs.started_at ASC`,
      [host.id, fromTs, toTs, VAT_RATE],
    )

    type Row = {
      booking_id: string; started_at: string | null; ended_at: string | null
      charger_name: string; energy_kwh: number; gross_pence: number
      net_pence: number; vat_pence: number; host_earnings_pence: number
    }
    const rows = sessionsRes.rows as Row[]

    const totalGross    = rows.reduce((s, r) => s + Number(r.gross_pence), 0)
    const totalNet      = rows.reduce((s, r) => s + Number(r.net_pence), 0)
    const totalVat      = rows.reduce((s, r) => s + Number(r.vat_pence), 0)
    const totalEarnings = rows.reduce((s, r) => s + Number(r.host_earnings_pence), 0)

    const hostName = host.business_name || host.full_name
    const invoiceNo = `ZG-${year}-${month}-${host.id.slice(0, 6).toUpperCase()}`
    const issued = new Date().toLocaleDateString('en-GB')

    if (format === 'html') {
      // HTML invoice suitable for browser print → PDF
      const rowsHtml = rows.map((r) => `
        <tr>
          <td>${new Date(r.started_at ?? '').toLocaleDateString('en-GB')}</td>
          <td>${r.charger_name}</td>
          <td>${Number(r.energy_kwh).toFixed(3)}</td>
          <td>£${(Number(r.gross_pence) / 100).toFixed(2)}</td>
          <td>£${(Number(r.net_pence) / 100).toFixed(2)}</td>
          <td>£${(Number(r.vat_pence) / 100).toFixed(2)}</td>
          <td>£${(Number(r.host_earnings_pence) / 100).toFixed(2)}</td>
        </tr>`).join('')

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>VAT Invoice ${invoiceNo}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; max-width: 900px; margin: 0 auto; padding: 32px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #f5f5f5; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
  td { padding: 8px; border-bottom: 1px solid #eee; }
  .totals { margin-top: 16px; text-align: right; }
  .totals p { margin: 4px 0; }
  .highlight { font-weight: bold; font-size: 16px; color: #00C853; }
  @media print { body { max-width: 100%; } }
</style>
</head><body>
<div class="meta">
  <div>
    <h1>VAT Invoice</h1>
    <p><strong>${hostName}</strong></p>
    ${host.vat_number ? `<p>VAT No: ${host.vat_number}</p>` : ''}
    <p>${host.email}</p>
  </div>
  <div style="text-align:right">
    <p><strong>Invoice No:</strong> ${invoiceNo}</p>
    <p><strong>Period:</strong> ${new Date(parseInt(year!), parseInt(month!) - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
    <p><strong>Issued:</strong> ${issued}</p>
    <p><strong>Issuer:</strong> Zipgrid Ltd, London, UK</p>
  </div>
</div>
<table>
  <thead><tr><th>Date</th><th>Charger</th><th>kWh</th><th>Gross (£)</th><th>Net (£)</th><th>VAT 20% (£)</th><th>Your earnings (£)</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="totals">
  <p>Gross total: £${(totalGross / 100).toFixed(2)}</p>
  <p>Net total: £${(totalNet / 100).toFixed(2)}</p>
  <p>VAT (20%): £${(totalVat / 100).toFixed(2)}</p>
  <p class="highlight">Your earnings: £${(totalEarnings / 100).toFixed(2)}</p>
  <p style="font-size:11px;color:#999">Zipgrid platform fee deducted before payout. VAT collected and remitted by Zipgrid Ltd.</p>
</div>
</body></html>`

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="${invoiceNo}.html"`,
        },
      })
    }

    // CSV format
    const csvRows = [
      ['Date', 'Charger', 'Energy (kWh)', 'Gross (£)', 'Net (£)', 'VAT 20% (£)', 'Your Earnings (£)'],
      ...rows.map((r) => [
        new Date(r.started_at ?? '').toLocaleDateString('en-GB'),
        r.charger_name,
        Number(r.energy_kwh).toFixed(3),
        (Number(r.gross_pence) / 100).toFixed(2),
        (Number(r.net_pence) / 100).toFixed(2),
        (Number(r.vat_pence) / 100).toFixed(2),
        (Number(r.host_earnings_pence) / 100).toFixed(2),
      ]),
      [],
      ['TOTAL', '', '', (totalGross / 100).toFixed(2), (totalNet / 100).toFixed(2), (totalVat / 100).toFixed(2), (totalEarnings / 100).toFixed(2)],
    ]
    const csv = [
      `# Zipgrid VAT Invoice — ${invoiceNo}`,
      `# Host: ${hostName}`,
      `# Period: ${period}`,
      `# Issued: ${issued}`,
      '',
      ...csvRows.map((r) => r.join(',')),
    ].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${invoiceNo}.csv"`,
      },
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[host/vat-invoice]', err)
    return apiError('INTERNAL_ERROR', 'Could not generate VAT invoice', 500)
  }
}
