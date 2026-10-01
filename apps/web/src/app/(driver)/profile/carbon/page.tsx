/**
 * @file page.tsx
 * @description /driver/profile/carbon — ESG / Carbon Impact tracker.
 * Shows the driver's lifetime CO₂ avoided vs. equivalent ICE journey,
 * year-by-year breakdown, tree equivalents, and share/download options.
 *
 * @module apps/web/app/(driver)/profile/carbon
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Leaf, Zap, Trees, Fuel, BarChart3,
  Download, Share2, Loader2, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type CarbonData = {
  totalSessions: number
  totalKwh: number
  totalCo2AvoidedKg: number
  treesEquivalent: number
  petrolLitresEquivalent: number
  gridIntensityGPerKwh: number
  yearly: Array<{
    year: number
    kWh: number
    co2AvoidedKg: number
    sessions: number
  }>
}

/* ── Helpers ────────────────────────────────────────────────── */

function formatKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tonnes`
  return `${kg.toFixed(1)} kg`
}

/* ── Stat card ──────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  value,
  label,
  sub,
  color = 'text-[hsl(var(--primary))]',
}: {
  icon: React.ElementType
  value: string
  label: string
  sub?: string
  color?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-center">
      <Icon className={cn('h-6 w-6', color)} aria-hidden="true" strokeWidth={1.5} />
      <div>
        <p className="font-mono text-2xl font-bold text-[hsl(var(--foreground))]">{value}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
        {sub && <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground)/0.7)]">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Year bar chart ─────────────────────────────────────────── */

function YearBar({ year, co2Kg, maxCo2 }: { year: number; co2Kg: number; maxCo2: number }) {
  const pct = maxCo2 > 0 ? (co2Kg / maxCo2) * 100 : 0
  return (
    <div className="flex items-end gap-3">
      <span className="w-10 shrink-0 text-right font-mono text-xs text-[hsl(var(--muted-foreground))]">{year}</span>
      <div className="flex-1">
        <div className="mb-0.5 flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>{formatKg(co2Kg)} CO₂ avoided</span>
        </div>
        <div className="h-5 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]"
          role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
          aria-label={`${year}: ${formatKg(co2Kg)} CO₂ avoided`}>
          <div
            className="h-full rounded-full bg-[hsl(var(--primary))] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

export default function CarbonPage() {
  const [data, setData] = useState<CarbonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/v1/account/carbon')
      .then((r) => r.json())
      .then((d: { success: boolean; data?: CarbonData; error?: { message: string } }) => {
        if (d.success && d.data) setData(d.data)
        else setError(d.error?.message ?? 'Could not load your carbon data.')
      })
      .catch(() => setError('Could not load your carbon data.'))
      .finally(() => setLoading(false))
  }, [])

  const handleShare = async () => {
    if (!data) return
    const text = `I've avoided ${formatKg(data.totalCo2AvoidedKg)} of CO₂ charging my EV on Zipgrid — the equivalent of planting ${data.treesEquivalent} trees! 🌱 #EV #GreenCharging #Zipgrid`
    try {
      if (navigator.share) {
        await navigator.share({ text, url: 'https://zipgrid.co.uk' })
      } else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    } catch { /* user cancelled share */ }
  }

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" aria-label="Loading" />
    </div>
  )

  if (error || !data) return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{error ?? 'No carbon data available.'}</p>
      <Link href="/profile" className="mt-4 block text-sm font-medium text-[hsl(var(--primary))]">← Back to profile</Link>
    </div>
  )

  const maxCo2 = Math.max(...data.yearly.map((y) => y.co2AvoidedKg), 1)
  const currentYear = new Date().getFullYear()
  const thisYear = data.yearly.find((y) => y.year === currentYear)

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-6">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/profile"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]"
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Carbon Impact</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Your lifetime EV charging footprint</p>
        </div>
      </div>

      {/* Hero stat */}
      <div className="mb-6 flex flex-col items-center gap-3 rounded-[8px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.05)] px-4 py-8 text-center">
        <Leaf className="h-10 w-10 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
        <div>
          <p className="font-mono text-4xl font-bold text-[hsl(var(--foreground))]">
            {formatKg(data.totalCo2AvoidedKg)}
          </p>
          <p className="mt-1 text-base text-[hsl(var(--muted-foreground))]">CO₂ avoided vs. petrol car</p>
        </div>
        {data.totalCo2AvoidedKg >= 100 && (
          <span className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/0.1)] px-3 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            CO₂ Hero
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          icon={Trees}
          value={String(data.treesEquivalent)}
          label="trees planted equivalent"
          sub="One tree absorbs ~21.8 kg CO₂/year"
          color="text-green-600"
        />
        <StatCard
          icon={Fuel}
          value={`${data.petrolLitresEquivalent}L`}
          label="petrol not burned"
          sub="1 litre petrol ≈ 2.39 kg CO₂"
          color="text-amber-600"
        />
        <StatCard
          icon={Zap}
          value={`${data.totalKwh.toFixed(0)} kWh`}
          label="total energy charged"
          sub={`${data.totalSessions} sessions`}
        />
        {thisYear && (
          <StatCard
            icon={BarChart3}
            value={formatKg(thisYear.co2AvoidedKg)}
            label={`CO₂ avoided in ${currentYear}`}
            sub={`${thisYear.sessions} sessions this year`}
          />
        )}
      </div>

      {/* Year breakdown */}
      {data.yearly.length > 0 && (
        <section className="mb-6" aria-labelledby="yearly-heading">
          <h2 id="yearly-heading" className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">Year by year</h2>
          <div className="flex flex-col gap-3 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            {[...data.yearly].reverse().map((y) => (
              <YearBar key={y.year} year={y.year} co2Kg={y.co2AvoidedKg} maxCo2={maxCo2} />
            ))}
          </div>
        </section>
      )}

      {/* Methodology */}
      <section className="mb-6 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">How we calculate this</h2>
        <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          CO₂ from your EV sessions = kWh charged × {data.gridIntensityGPerKwh}g/kWh (UK grid average, DESNZ 2026).
          CO₂ from equivalent petrol journey = kWh × 5.63 km/kWh × 170g CO₂/km (SMMT fleet average).
          CO₂ avoided = petrol equivalent − EV actual. Figures are indicative — actual emissions depend on local grid mix and driving style.
        </p>
      </section>

      {/* Share / download */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleShare}
          className={cn(
            'flex flex-1 h-11 items-center justify-center gap-2 rounded-[6px]',
            'border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.06)]',
            'text-sm font-semibold text-[hsl(var(--primary))] transition-colors hover:bg-[hsl(var(--primary)/0.1)]',
          )}
        >
          {copied
            ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Copied!</>
            : <><Share2 className="h-4 w-4" aria-hidden="true" /> Share my impact</>}
        </button>
        <button
          type="button"
          disabled
          title="Annual summary PDF — coming soon"
          className={cn(
            'flex flex-1 h-11 items-center justify-center gap-2 rounded-[6px]',
            'border border-[hsl(var(--border))] text-sm font-medium',
            'text-[hsl(var(--muted-foreground))] cursor-not-allowed opacity-60',
          )}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PDF
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-[hsl(var(--muted-foreground))]">
        Annual carbon summary PDF certificate — coming soon.
      </p>
    </div>
  )
}
