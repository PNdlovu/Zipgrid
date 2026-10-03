/**
 * @file page.tsx
 * @description /smb/export — CSV data export for SMB hosts.
 * Export sessions, earnings, or customer data for a selected date range.
 * Also generates VAT invoices in PDF-ready format.
 *
 * @module apps/web/app/(smb)/smb/export
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState } from 'react'
import {
  Download, FileText, Loader2, CheckCircle2, AlertCircle,
  Calendar, Users, PoundSterling, FileSpreadsheet, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type ExportType = 'sessions' | 'earnings' | 'customers' | 'vat_invoices'

type ExportConfig = {
  type: ExportType
  from: string
  to: string
  includeHeaders: boolean
}

type ExportJob = {
  jobId: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  downloadUrl: string | null
  rowCount: number | null
  expiresAt: string | null
}

/* ── API ─────────────────────────────────────────────────────── */

/** Requests an async export job from the API. */
async function requestExport(config: ExportConfig): Promise<ExportJob> {
  const res = await fetch('/api/v1/host/analytics/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(config),
  })
  const json = await res.json() as { success: boolean; data?: { job: ExportJob }; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Export failed')
  return json.data!.job
}


/* ── Helpers ─────────────────────────────────────────────────── */

/** Converts a Date to an ISO date string (YYYY-MM-DD). */
function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]!
}

const EXPORT_OPTIONS: Array<{
  type: ExportType
  label: string
  description: string
  icon: React.ReactNode
  columns: string[]
}> = [
  {
    type: 'sessions',
    label: 'Charging sessions',
    description: 'All charging sessions with energy, cost, and duration',
    icon: <Zap className="h-5 w-5 text-blue-600" />,
    columns: ['date', 'driver', 'charger', 'duration_min', 'energy_kwh', 'revenue_£', 'status'],
  },
  {
    type: 'earnings',
    label: 'Earnings & payouts',
    description: 'Revenue breakdown, platform fees, and net earnings per charger',
    icon: <PoundSterling className="h-5 w-5 text-green-600" />,
    columns: ['date', 'charger', 'gross_£', 'platform_fee_£', 'net_£', 'payout_status'],
  },
  {
    type: 'customers',
    label: 'Customer data',
    description: 'Anonymised driver usage data per session (GDPR-compliant)',
    icon: <Users className="h-5 w-5 text-purple-600" />,
    columns: ['session_date', 'vehicle_type', 'plug_type', 'duration_min', 'energy_kwh', 'spend_£'],
  },
  {
    type: 'vat_invoices',
    label: 'VAT invoices',
    description: 'Monthly VAT invoices for accountants (UK 20% VAT)',
    icon: <FileText className="h-5 w-5 text-amber-600" />,
    columns: ['invoice_no', 'period', 'net_£', 'vat_£', 'gross_£', 'charger_count'],
  },
]

/* ── Page ───────────────────────────────────────────────────── */

/** SMB data export page — CSV/XLSX download for sessions, earnings, customers, and VAT invoices. */
export default function SmbExportPage() {
  const defaultTo   = isoDate(new Date())
  const defaultFrom = isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

  const [selected, setSelected]   = useState<ExportType>('sessions')
  const [from, setFrom]           = useState(defaultFrom)
  const [to, setTo]               = useState(defaultTo)
  const [headers, setHeaders]     = useState(true)
  const [job, setJob]             = useState<ExportJob | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const option = EXPORT_OPTIONS.find((o) => o.type === selected)!

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    setJob(null)
    try {
      setJob(await requestExport({ type: selected, from, to, includeHeaders: headers }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Data Export</h1>
        <p className="mt-1 text-sm text-gray-500">
          Export your charging data as CSV — opens in Excel, Google Sheets, Numbers and Xero.
        </p>
      </div>

      {/* Export type selection */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {EXPORT_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => setSelected(opt.type)}
            className={cn(
              'flex gap-3 rounded-xl border p-4 text-left transition-colors',
              selected === opt.type
                ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
                : 'border-gray-200 bg-white hover:bg-gray-50',
            )}
            aria-pressed={selected === opt.type}
          >
            <span className="mt-0.5 flex-shrink-0">{opt.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Columns preview */}
      <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <FileSpreadsheet className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">COLUMNS INCLUDED</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {option.columns.map((c) => (
            <span key={c} className="rounded bg-white border border-gray-200 px-2 py-0.5 text-xs font-mono text-gray-700">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Config */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <Calendar className="h-3.5 w-3.5" /> From date
          </label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <Calendar className="h-3.5 w-3.5" /> To date
          </label>
          <input
            type="date"
            value={to}
            min={from}
            max={isoDate(new Date())}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            id="headers"
            checked={headers}
            onChange={(e) => setHeaders(e.target.checked)}
            className="h-4 w-4 rounded accent-green-600"
          />
          <label htmlFor="headers" className="text-sm text-gray-700 select-none">Include column headers</label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Job status */}
      {job && (
        <div className={cn(
          'mb-4 rounded-lg border p-4',
          job.status === 'ready'      ? 'border-green-200 bg-green-50' :
          job.status === 'failed'     ? 'border-red-200 bg-red-50' :
          'border-blue-200 bg-blue-50',
        )}>
          <div className="flex items-center gap-2">
            {job.status === 'ready'  && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            {job.status === 'failed' && <AlertCircle className="h-5 w-5 text-red-500" />}
            {(job.status === 'queued' || job.status === 'processing') && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {job.status === 'ready'      ? `Export ready${job.rowCount != null ? ` — ${job.rowCount.toLocaleString()} rows` : ''}` :
                 job.status === 'failed'     ? 'Export failed' :
                 job.status === 'processing' ? 'Preparing your export…' :
                 'Export queued'}
              </p>
              {job.expiresAt && job.status === 'ready' && (
                <p className="text-xs text-gray-500">
                  Download link expires {new Date(job.expiresAt).toLocaleString('en-GB')}
                </p>
              )}
            </div>
          </div>
          {job.downloadUrl && job.status === 'ready' && (
            <a
              href={job.downloadUrl}
              download
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              <Download className="h-4 w-4" /> Download CSV
            </a>
          )}
        </div>
      )}

      {/* Export button */}
      {(!job || job.status === 'failed') && (
        <button
          onClick={handleExport}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? 'Preparing export…' : `Export ${option.label}`}
        </button>
      )}

      {job?.status === 'ready' && (
        <button
          onClick={() => { setJob(null); setError(null) }}
          className="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Export another file
        </button>
      )}
    </div>
  )
}
