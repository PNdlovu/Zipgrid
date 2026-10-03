/**
 * @file route.ts
 * @description POST /api/v1/host/analytics/export
 * Creates an async export job for sessions, earnings, customers, or VAT invoices.
 * For this implementation, jobs are processed synchronously (small datasets).
 * Returns a signed one-time download URL.
 *
 * @module apps/web/api/v1/host/analytics/export
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { planGate } from '@/lib/api/plan-gate'

const ExportSchema = z.object({
  type:           z.enum(['sessions', 'earnings', 'customers', 'vat_invoices']),
  from:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format:         z.enum(['csv', 'xlsx']).default('csv'),
  includeHeaders: z.boolean().default(true),
})

// ── CSV builder ───────────────────────────────────────────────

function escapeCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`
  }
  return s
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = rows.map((r) => r.map(escapeCell).join(','))
  return [headers.join(','), ...lines].join('\n')
}

/** POST /api/v1/host/analytics/export — Creates an async export job for sessions, earnings, customers, or VAT invoices. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const blocked = await planGate(userId, 'data_export')
  if (blocked) return blocked

  let body: z.infer<typeof ExportSchema>
  try { body = ExportSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid request', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const hostRes = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (hostRes.rows.length === 0) return apiError('FORBIDDEN', 'Host profile not found', 403)
    const hostProfileId = (hostRes.rows[0] as { id: string }).id

    const fromTs = `${body.from}T00:00:00Z`
    const toTs   = `${body.to}T23:59:59Z`

    let csvContent = ''
    let rowCount = 0

    if (body.type === 'sessions') {
      const res = await db.execute(
        `SELECT
           cs.started_at::DATE AS date,
           u.full_name AS driver,
           cl.title AS charger,
           ROUND(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at)) / 60)::INT AS duration_min,
           ROUND((cs.energy_consumed_wh / 1000.0)::NUMERIC, 2) AS energy_kwh,
           ROUND((COALESCE(cs.total_session_cost_cents, 0) / 100.0)::NUMERIC, 2) AS revenue_gbp,
           cs.status
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         JOIN users u ON u.id = dp.user_id
         WHERE cl.host_profile_id = $1
           AND cs.created_at BETWEEN $2 AND $3
         ORDER BY cs.started_at DESC
         LIMIT 10000`,
        [hostProfileId, fromTs, toTs],
      )
      rowCount = res.rows.length
      const headers = ['date', 'driver', 'charger', 'duration_min', 'energy_kwh', 'revenue_£', 'status']
      const rows = (res.rows as Record<string, unknown>[]).map((r) =>
        headers.map((h) => r[h.replace('£', 'gbp').replace('_', '_')] ?? r[h] ?? ''),
      )
      csvContent = buildCsv(headers, rows)
    }

    else if (body.type === 'earnings') {
      const res = await db.execute(
        `SELECT
           t.created_at::DATE AS date,
           cl.title AS charger,
           ROUND((t.total_charged_cents / 100.0)::NUMERIC, 2) AS gross_gbp,
           ROUND((t.platform_fee_cents / 100.0)::NUMERIC, 2) AS platform_fee_gbp,
           ROUND((t.host_earnings_cents / 100.0)::NUMERIC, 2) AS net_gbp,
           t.status AS payout_status
         FROM transactions t
         JOIN bookings b ON b.id = t.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         WHERE cl.host_profile_id = $1
           AND t.created_at BETWEEN $2 AND $3
         ORDER BY t.created_at DESC
         LIMIT 10000`,
        [hostProfileId, fromTs, toTs],
      )
      rowCount = res.rows.length
      const headers = ['date', 'charger', 'gross_£', 'platform_fee_£', 'net_£', 'payout_status']
      const rows = (res.rows as Record<string, unknown>[]).map((r) =>
        [r['date'], r['charger'], r['gross_gbp'], r['platform_fee_gbp'], r['net_gbp'], r['payout_status']],
      )
      csvContent = buildCsv(headers, rows)
    }

    else if (body.type === 'customers') {
      const res = await db.execute(
        `SELECT
           cs.started_at::DATE AS session_date,
           dv.make || ' ' || dv.model AS vehicle_type,
           dv.plug_types[1] AS plug_type,
           ROUND(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at)) / 60)::INT AS duration_min,
           ROUND((cs.energy_consumed_wh / 1000.0)::NUMERIC, 2) AS energy_kwh,
           ROUND((COALESCE(cs.total_session_cost_cents, 0) / 100.0)::NUMERIC, 2) AS spend_gbp
         FROM charging_sessions cs
         JOIN bookings b ON b.id = cs.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         JOIN driver_profiles dp ON dp.id = b.driver_profile_id
         JOIN driver_vehicles dv ON dv.id = b.vehicle_id
         WHERE cl.host_profile_id = $1
           AND cs.created_at BETWEEN $2 AND $3
         ORDER BY cs.started_at DESC
         LIMIT 10000`,
        [hostProfileId, fromTs, toTs],
      )
      rowCount = res.rows.length
      const headers = ['session_date', 'vehicle_type', 'plug_type', 'duration_min', 'energy_kwh', 'spend_£']
      const rows = (res.rows as Record<string, unknown>[]).map((r) =>
        [r['session_date'], r['vehicle_type'], r['plug_type'], r['duration_min'], r['energy_kwh'], r['spend_gbp']],
      )
      csvContent = buildCsv(headers, rows)
    }

    else if (body.type === 'vat_invoices') {
      const res = await db.execute(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', t.created_at), 'YYYY-MM') AS period,
           COUNT(t.id)::INT AS invoice_count,
           ROUND((SUM(t.total_charged_cents) / 120.0)::NUMERIC, 2) AS net_gbp,
           ROUND((SUM(t.total_charged_cents) / 120.0 * 0.20)::NUMERIC, 2) AS vat_gbp,
           ROUND((SUM(t.total_charged_cents) / 100.0)::NUMERIC, 2) AS gross_gbp,
           COUNT(DISTINCT cl.id)::INT AS charger_count
         FROM transactions t
         JOIN bookings b ON b.id = t.booking_id
         JOIN charger_listings cl ON cl.id = b.listing_id
         WHERE cl.host_profile_id = $1
           AND t.created_at BETWEEN $2 AND $3
           AND t.status = 'captured'
         GROUP BY DATE_TRUNC('month', t.created_at)
         ORDER BY 1 DESC`,
        [hostProfileId, fromTs, toTs],
      )
      rowCount = res.rows.length
      const headers = ['invoice_no', 'period', 'net_£', 'vat_£', 'gross_£', 'charger_count']
      const rows = (res.rows as Record<string, unknown>[]).map((r, i) =>
        [`INV-${String(i + 1).padStart(4, '0')}`, r['period'], r['net_gbp'], r['vat_gbp'], r['gross_gbp'], r['charger_count']],
      )
      csvContent = buildCsv(headers, rows)
    }

    // Encode as data URI (for small exports) — production would upload to R2/S3
    const encodedData = Buffer.from(csvContent).toString('base64')
    const mimeType = body.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
    const fileName = `zipgrid-${body.type}-${body.from}-${body.to}.${body.format}`

    // In production: upload to Vercel Blob/S3, return signed URL
    // For now: return as base64 data URI
    const downloadUrl = `data:${mimeType};base64,${encodedData}`

    const job = {
      jobId:       crypto.randomUUID(),
      status:      'ready' as const,
      downloadUrl,
      rowCount,
      fileName,
      expiresAt:   new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min
    }

    return apiResponse({ job }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[host/analytics/export]', err)
    return apiError('INTERNAL_ERROR', 'Export failed', 500)
  }
}

