/**
 * @file page.tsx
 * @description /smb/pricing — AI-powered dynamic pricing engine for SMB hosts.
 * Shows current pricing per charger, AI suggestions, peak-hours surcharge
 * configuration, and a bulk-apply tool.
 *
 * @module apps/web/app/(smb)/smb/pricing
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, Zap, Clock, PoundSterling, Loader2,
  Lightbulb, CheckCircle2, AlertCircle, RefreshCw, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type PricingModel = 'per_kwh' | 'per_hour' | 'per_session' | 'hybrid'

type ListingPricing = {
  listingId: string
  title: string
  city: string
  pricingModel: PricingModel
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinPence: number
  peakSurchargePct: number
  peakHoursStart: string | null
  peakHoursEnd: string | null
  // AI suggestions
  aiSuggestedKwhPence: number | null
  aiSuggestedHourPence: number | null
  aiConfidence: number | null
  aiReason: string | null
  utilisationPct: number
  avgMarketKwhPence: number | null
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchPricing(): Promise<ListingPricing[]> {
  const res = await fetch('/api/v1/host/listings?format=pricing', { credentials: 'include' })
  const json = await res.json() as { data?: { listings: ListingPricing[] } }
  return json.data?.listings ?? []
}

async function savePricing(listingId: string, update: Partial<ListingPricing>): Promise<void> {
  await fetch(`/api/v1/listings/${listingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  })
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number | null): string {
  if (p == null) return '—'
  return `£${(p / 100).toFixed(2)}`
}

function utilisationColor(pct: number) {
  if (pct >= 70) return 'text-green-600'
  if (pct >= 40) return 'text-amber-600'
  return 'text-red-500'
}

/* ── Pricing row editor ─────────────────────────────────────── */

function PricingRow({ listing, onSaved }: { listing: ListingPricing; onSaved: () => void }) {
  const [kwhInput, setKwhInput]         = useState(listing.pricePerKwhPence != null ? String(listing.pricePerKwhPence / 100) : '')
  const [hourInput, setHourInput]       = useState(listing.pricePerHourPence != null ? String(listing.pricePerHourPence / 100) : '')
  const [sessionInput, setSessionInput] = useState(listing.pricePerSessionPence != null ? String(listing.pricePerSessionPence / 100) : '')
  const [surcharge, setSurcharge]       = useState(String(listing.peakSurchargePct))
  const [peakStart, setPeakStart]       = useState(listing.peakHoursStart ?? '')
  const [peakEnd, setPeakEnd]           = useState(listing.peakHoursEnd ?? '')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [expanded, setExpanded]         = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await savePricing(listing.listingId, {
        pricePerKwhPence:     kwhInput     ? Math.round(parseFloat(kwhInput) * 100)     : null,
        pricePerHourPence:    hourInput    ? Math.round(parseFloat(hourInput) * 100)    : null,
        pricePerSessionPence: sessionInput ? Math.round(parseFloat(sessionInput) * 100) : null,
        peakSurchargePct:     parseFloat(surcharge) || 0,
        peakHoursStart:       peakStart || null,
        peakHoursEnd:         peakEnd || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSaved()
    } catch {
      alert('Failed to save pricing')
    } finally {
      setSaving(false)
    }
  }

  const applyAiSuggestion = () => {
    if (listing.aiSuggestedKwhPence) setKwhInput(String(listing.aiSuggestedKwhPence / 100))
    if (listing.aiSuggestedHourPence) setHourInput(String(listing.aiSuggestedHourPence / 100))
  }

  const hasSuggestion = listing.aiSuggestedKwhPence != null || listing.aiSuggestedHourPence != null

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-gray-900">{listing.title}</h3>
          <p className="text-xs text-gray-500">{listing.city} · {listing.pricingModel.replace('_', ' ')}</p>
        </div>
        <div className="ml-4 flex flex-shrink-0 items-center gap-3">
          <span className={cn('text-sm font-semibold', utilisationColor(listing.utilisationPct))}>
            {listing.utilisationPct.toFixed(0)}% util
          </span>
          {hasSuggestion && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              💡 AI suggestion
            </span>
          )}
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          {/* AI suggestion banner */}
          {hasSuggestion && listing.aiReason && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">AI Pricing Suggestion</span>
                {listing.aiConfidence && (
                  <span className="text-xs text-amber-600">{Math.round(listing.aiConfidence * 100)}% confidence</span>
                )}
              </div>
              <p className="mb-2 text-xs text-amber-700">{listing.aiReason}</p>
              <div className="flex flex-wrap gap-3 text-xs text-amber-800">
                {listing.aiSuggestedKwhPence && <span>Suggested kWh: <strong>{fmtPence(listing.aiSuggestedKwhPence)}</strong></span>}
                {listing.aiSuggestedHourPence && <span>Suggested /hr: <strong>{fmtPence(listing.aiSuggestedHourPence)}</strong></span>}
                {listing.avgMarketKwhPence && <span>Market avg: <strong>{fmtPence(listing.avgMarketKwhPence)}</strong></span>}
              </div>
              <button
                onClick={applyAiSuggestion}
                className="mt-2 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900"
              >
                Apply suggestion →
              </button>
            </div>
          )}

          {/* Price inputs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <PriceInput label="Per kWh (£)" value={kwhInput} onChange={setKwhInput} placeholder="e.g. 0.30" icon={<Zap className="h-4 w-4" />} />
            <PriceInput label="Per hour (£)" value={hourInput} onChange={setHourInput} placeholder="e.g. 2.50" icon={<Clock className="h-4 w-4" />} />
            <PriceInput label="Per session (£)" value={sessionInput} onChange={setSessionInput} placeholder="e.g. 5.00" icon={<PoundSterling className="h-4 w-4" />} />
          </div>

          {/* Peak hours */}
          <div className="mt-4 rounded-lg bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Peak hours surcharge</span>
              <span className="ml-1 text-xs text-gray-400">(optional)</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Surcharge %</label>
                <input
                  type="number" min="0" max="100" step="5"
                  value={surcharge}
                  onChange={(e) => setSurcharge(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="e.g. 25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Start time</label>
                <input
                  type="time"
                  value={peakStart}
                  onChange={(e) => setPeakStart(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">End time</label>
                <input
                  type="time"
                  value={peakEnd}
                  onChange={(e) => setPeakEnd(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : null}
              {saved ? 'Saved!' : saving ? 'Saving…' : 'Save pricing'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PriceInput({
  label, value, onChange, placeholder, icon,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; icon: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600">
        {icon}{label}
      </label>
      <input
        type="number" min="0" step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

export default function SmbPricingPage() {
  const [listings, setListings] = useState<ListingPricing[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setListings(await fetchPricing())
    } catch {
      setError('Could not load pricing data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Dynamic Pricing</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set pricing per charger. AI suggestions are based on local demand, market rates, and your utilisation.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
          <p className="text-sm text-blue-800">
            AI suggestions are generated nightly from local market data. You remain in full control — apply suggestions with one click or set your own rates.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">No listings found. Add a charger first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((l) => (
            <PricingRow key={l.listingId} listing={l} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  )
}
