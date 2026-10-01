/**
 * @file page.tsx
 * @description /property — Residential property vertical.
 * Apartment building management: block of flats with shared EV charging bays.
 * Property managers can add all charging bays, set access rules, and
 * split revenue between the building and individual residents.
 *
 * @module apps/web/app/(driver)/property
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Building2, Users, PlusCircle, Loader2, ChevronRight, Zap, PoundSterling, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type Property = {
  id: string
  name: string
  address: string
  city: string
  postcode: string
  totalBays: number
  activeBays: number
  totalResidents: number
  monthlyRevenuePence: number
  revenueShareModel: 'property' | 'resident' | 'split'
  splitRatioPct: number   // % going to property (vs resident)
}

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches managed properties. */
async function fetchProperties(): Promise<Property[]> {
  const res = await fetch('/api/v1/property/list', { credentials: 'include' })
  const json = await res.json() as { data?: { properties: Property[] } }
  return json.data?.properties ?? []
}

/* ── Page ───────────────────────────────────────────────────── */

/** Residential property management portal. */
export default function PropertyPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    void fetchProperties().then(setProperties).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-green-600" /></div>

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Property Portal</h1>
          <p className="mt-1 text-sm text-gray-500">Manage EV charging across your residential buildings.</p>
        </div>
        <Link href="/property/new" className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
          <PlusCircle className="h-4 w-4" /> Add property
        </Link>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-16 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h2 className="text-lg font-bold text-gray-700">No properties yet</h2>
          <p className="mt-1 text-sm text-gray-400">Add your first building to start managing EV charging for residents.</p>
          <Link href="/property/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
            <PlusCircle className="h-4 w-4" /> Add property
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {properties.map((p) => (
            <Link key={p.id} href={`/property/${p.id}`} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">{p.name}</h2>
                  <p className="text-xs text-gray-400">{p.address}, {p.city} {p.postcode}</p>
                </div>
                <Building2 className="h-6 w-6 flex-shrink-0 text-gray-300" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <StatMini icon={<Zap className="h-4 w-4 text-blue-500" />} label="Bays" value={`${p.activeBays}/${p.totalBays}`} />
                <StatMini icon={<Users className="h-4 w-4 text-purple-500" />} label="Residents" value={String(p.totalResidents)} />
                <StatMini icon={<PoundSterling className="h-4 w-4 text-green-600" />} label="Monthly" value={`£${(p.monthlyRevenuePence / 100).toFixed(0)}`} green />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 capitalize">
                  {p.revenueShareModel.replace('_', ' ')} split
                  {p.revenueShareModel === 'split' ? ` (${p.splitRatioPct}%/${100 - p.splitRatioPct}%)` : ''}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatMini({ icon, label, value, green }: { icon: React.ReactNode; label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2">
      <div className="flex justify-center mb-0.5">{icon}</div>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={cn('text-sm font-bold', green ? 'text-green-700' : 'text-gray-900')}>{value}</p>
    </div>
  )
}
