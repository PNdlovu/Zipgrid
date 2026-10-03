/**
 * @file page.tsx
 * @description /fleet — Corporate fleet account overview.
 * Drivers belonging to a fleet account see their spend policy,
 * approved locations, monthly spend, and corporate invoice status.
 *
 * @module apps/web/app/(driver)/fleet
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Building2, Users, PoundSterling, Zap, Shield, CheckCircle2, AlertCircle, Loader2, ChevronRight, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type FleetMembership = {
  fleetAccountId: string
  companyName: string
  role: 'driver' | 'fleet_admin'
  spendPolicy: {
    maxSpendPerSessionPence: number | null
    maxSpendPerMonthPence: number | null
    allowedListingTypes: string[]
    requiresApproval: boolean
  }
  thisMonth: {
    sessionsCount: number
    totalSpendPence: number
    totalKwh: number
  }
  invoiceStatus: 'current' | 'overdue' | 'pending'
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchFleet(): Promise<FleetMembership | null> {
  const res = await fetch('/api/v1/fleet/membership', { credentials: 'include' })
  if (res.status === 404) return null
  const json = await res.json() as { data?: { fleet: FleetMembership } }
  return json.data?.fleet ?? null
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

/* ── Page ───────────────────────────────────────────────────── */

/** Page at /fleet — Corporate fleet account overview. */
export default function FleetPage() {
  const [fleet, setFleet]   = useState<FleetMembership | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setFleet(await fetchFleet())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-green-600" /></div>
  }

  if (!fleet) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-200" />
        <h1 className="text-xl font-bold text-gray-700">No fleet account</h1>
        <p className="mt-2 text-sm text-gray-500">
          You are not currently part of a corporate fleet account.
          Ask your company&apos;s fleet manager to invite you, or contact Zipgrid Business.
        </p>
        <Link href="/for-businesses" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
          Zipgrid for Business <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  const policyItems = [
    fleet.spendPolicy.maxSpendPerSessionPence != null && {
      label: 'Max spend per session',
      value: fmtPence(fleet.spendPolicy.maxSpendPerSessionPence),
      ok: true,
    },
    fleet.spendPolicy.maxSpendPerMonthPence != null && {
      label: 'Monthly spend limit',
      value: fmtPence(fleet.spendPolicy.maxSpendPerMonthPence),
      ok: fleet.thisMonth.totalSpendPence <= fleet.spendPolicy.maxSpendPerMonthPence,
    },
    {
      label: 'Approval required',
      value: fleet.spendPolicy.requiresApproval ? 'Yes — manager approval needed' : 'No — instant book',
      ok: !fleet.spendPolicy.requiresApproval,
    },
  ].filter(Boolean) as Array<{ label: string; value: string; ok: boolean }>

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-gray-500" />
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{fleet.companyName}</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500 capitalize">Role: {fleet.role.replace('_', ' ')}</p>
      </div>

      {/* This month summary */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <KpiCard icon={<Zap className="h-5 w-5 text-blue-600" />} label="Sessions" value={String(fleet.thisMonth.sessionsCount)} />
        <KpiCard icon={<PoundSterling className="h-5 w-5 text-green-600" />} label="Spend this month" value={fmtPence(fleet.thisMonth.totalSpendPence)} green />
        <KpiCard icon={<BarChart3 className="h-5 w-5 text-purple-600" />} label="kWh this month" value={fleet.thisMonth.totalKwh.toFixed(1)} />
      </div>

      {/* Spend policy */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900">
          <Shield className="h-5 w-5 text-gray-400" /> Spend policy
        </h2>
        <div className="space-y-3">
          {policyItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{item.value}</span>
                {item.ok
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : <AlertCircle className="h-4 w-4 text-red-500" />}
              </div>
            </div>
          ))}
          {fleet.spendPolicy.allowedListingTypes.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Allowed charger types</span>
              <span className="text-sm font-semibold text-gray-900 capitalize">
                {fleet.spendPolicy.allowedListingTypes.join(', ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Invoice status */}
      <div className={cn(
        'mb-6 flex items-center gap-3 rounded-xl border p-4',
        fleet.invoiceStatus === 'current' ? 'border-green-200 bg-green-50' :
        fleet.invoiceStatus === 'overdue' ? 'border-red-200 bg-red-50' :
        'border-amber-200 bg-amber-50',
      )}>
        {fleet.invoiceStatus === 'current'
          ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
          : <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />}
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Invoice status: <span className="capitalize">{fleet.invoiceStatus}</span>
          </p>
          {fleet.invoiceStatus === 'overdue' && (
            <p className="text-xs text-red-600 mt-0.5">Please contact your fleet admin — an invoice is overdue.</p>
          )}
        </div>
      </div>

      {/* Links */}
      {fleet.role === 'fleet_admin' && (
        <Link
          href="/fleet/admin"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <Users className="h-4 w-4" /> Manage fleet account
          <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
        </Link>
      )}
    </div>
  )
}

function KpiCard({ icon, label, value, green }: { icon: React.ReactNode; label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn('text-lg font-extrabold', green ? 'text-green-700' : 'text-gray-900')}>{value}</p>
    </div>
  )
}
