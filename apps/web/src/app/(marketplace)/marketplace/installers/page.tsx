/**
 * @file page.tsx
 * @description /marketplace/installers — EV installer directory.
 * Find OZEV-approved EV charger installers near you, book via escrow.
 *
 * @module apps/web/app/(marketplace)/marketplace/installers
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Star, Loader2, AlertCircle, MapPin,
  CheckCircle2, Wrench, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Installer = {
  id: string
  companyName: string
  isOzevApproved: boolean
  certifications: string[]
  serviceCategories: string[]
  averageRating: number | null
  reviewCount: number
  completedJobs: number
  baseChargePence: number | null
  distanceKm: number | null
  logoUrl: string | null
  description: string | null
}

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches installers from the API. */
async function fetchInstallers(params: {
  q?: string; service?: string; ozev?: boolean; postcode?: string; page?: number
}): Promise<{ installers: Installer[]; total: number }> {
  const sp = new URLSearchParams()
  if (params.q)        sp.set('q', params.q)
  if (params.service)  sp.set('service', params.service)
  if (params.ozev)     sp.set('ozev', 'true')
  if (params.postcode) sp.set('postcode', params.postcode)
  sp.set('page', String(params.page ?? 1))
  sp.set('pageSize', '20')
  const res = await fetch(`/api/v1/marketplace/installers?${sp}`)
  const json = await res.json() as { data?: Installer[]; meta?: { total: number } }
  return { installers: json.data ?? [], total: json.meta?.total ?? 0 }
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Formats pence as a £ price string. */
function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

const SERVICE_CATEGORIES = [
  { value: '',                  label: 'All services' },
  { value: 'ev_charger_install', label: 'EV Charger Install' },
  { value: 'solar_panel',       label: 'Solar Panels' },
  { value: 'battery_storage',   label: 'Battery Storage' },
  { value: 'electrical_survey', label: 'Electrical Survey' },
]

/* ── Installer card ─────────────────────────────────────────── */

function InstallerCard({ installer }: { installer: Installer }) {
  return (
    <Link
      href={`/marketplace/installers/${installer.id}`}
      className="flex gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Logo */}
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
        {installer.logoUrl
          ? <img src={installer.logoUrl} alt={installer.companyName} className="h-full w-full object-cover" />
          : <Wrench className="h-6 w-6 text-gray-400" />}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-gray-900">{installer.companyName}</h3>
            {installer.distanceKm != null && (
              <p className="flex items-center gap-1 text-xs text-gray-400">
                <MapPin className="h-3 w-3" /> {installer.distanceKm.toFixed(1)} km away
              </p>
            )}
          </div>
          {installer.isOzevApproved && (
            <span className="flex-shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> OZEV
            </span>
          )}
        </div>

        {installer.description && (
          <p className="mt-1 text-xs text-gray-500 line-clamp-2">{installer.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {installer.averageRating != null && (
            <span className="flex items-center gap-1 text-sm text-gray-600">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {installer.averageRating.toFixed(1)} ({installer.reviewCount})
            </span>
          )}
          <span className="text-xs text-gray-400">{installer.completedJobs} jobs completed</span>
          {installer.baseChargePence && (
            <span className="text-sm font-semibold text-gray-900">from {fmtPence(installer.baseChargePence)}</span>
          )}
        </div>

        {installer.certifications.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {installer.certifications.slice(0, 3).map((c) => (
              <span key={c} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{c}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

/** Marketplace installers directory page. */
export default function MarketplaceInstallersPage() {
  const [installers, setInstallers] = useState<Installer[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [query, setQuery]           = useState('')
  const [service, setService]       = useState('')
  const [ozevOnly, setOzevOnly]     = useState(false)
  const [postcode, setPostcode]     = useState('')
  const [page, setPage]             = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { installers: is, total: t } = await fetchInstallers({
        q: query || undefined,
        service: service || undefined,
        ozev: ozevOnly || undefined,
        postcode: postcode || undefined,
        page,
      })
      setInstallers(is)
      setTotal(t)
    } catch {
      setError('Could not load installers.')
    } finally {
      setLoading(false)
    }
  }, [query, service, ozevOnly, postcode, page])

  useEffect(() => { void load() }, [load])

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">EV Installers</h1>
        <p className="mt-1 text-sm text-gray-500">Find certified EV charger installers near you.</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search installers…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <input
            type="text"
            placeholder="Postcode"
            value={postcode}
            onChange={(e) => { setPostcode(e.target.value.toUpperCase()); setPage(1) }}
            className="w-32 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SERVICE_CATEGORIES.map((sc) => (
            <button
              key={sc.value}
              onClick={() => { setService(sc.value); setPage(1) }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                service === sc.value ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {sc.label}
            </button>
          ))}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ozevOnly}
              onChange={(e) => { setOzevOnly(e.target.checked); setPage(1) }}
              className="rounded accent-green-600"
            />
            <Shield className="h-3.5 w-3.5 text-green-600" />
            OZEV approved only
          </label>
        </div>
      </div>

      {!loading && <p className="mb-4 text-sm text-gray-500">{total.toLocaleString()} installer{total !== 1 ? 's' : ''}</p>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : installers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No installers found matching your criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {installers.map((i) => <InstallerCard key={i.id} installer={i} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
