/**
 * @file page.tsx
 * @description /fleet/admin — Corporate fleet management portal.
 * Fleet admins can manage team members, set spend policies, view
 * consolidated usage analytics, and download monthly invoices.
 *
 * @module apps/web/app/(driver)/fleet/admin
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, PoundSterling, Zap, Car, Download, Plus, Trash2,
  Settings, BarChart3, CheckCircle2, AlertCircle, Loader2,
  Mail, UserPlus, Shield, ChevronRight, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type FleetDriver = {
  userId: string
  fullName: string
  email: string
  joinedAt: string
  thisMonthSessions: number
  thisMonthSpendPence: number
  thisMonthKwh: number
  status: 'active' | 'invited' | 'suspended'
}

type FleetPolicy = {
  maxSpendPerSessionPence: number | null
  maxSpendPerMonthPence: number | null
  allowedListingTypes: string[]
  requiresApproval: boolean
}

type FleetAnalytics = {
  thisMonth: { totalSpendPence: number; totalSessions: number; totalKwh: number }
  lastMonth: { totalSpendPence: number; totalSessions: number; totalKwh: number }
  topDriverId: string | null
  topDriverName: string | null
  avgCostPerSessionPence: number
}

type FleetAccount = {
  id: string
  companyName: string
  drivers: FleetDriver[]
  policy: FleetPolicy
  analytics: FleetAnalytics
}

/* ── API ─────────────────────────────────────────────────────── */

async function fetchFleetAdmin(): Promise<FleetAccount> {
  const res = await fetch('/api/v1/fleet/admin', { credentials: 'include' })
  const json = await res.json() as { data?: { fleet: FleetAccount } }
  if (!json.data?.fleet) throw new Error('Fleet account not found')
  return json.data.fleet
}

async function inviteDriver(email: string): Promise<void> {
  await fetch('/api/v1/fleet/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
}

async function removeDriver(userId: string): Promise<void> {
  await fetch(`/api/v1/fleet/drivers/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

async function updatePolicy(policy: Partial<FleetPolicy>): Promise<void> {
  await fetch('/api/v1/fleet/policy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(policy),
  })
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number | null | undefined): string {
  if (p == null) return '—'
  return `£${(p / 100).toFixed(2)}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_STYLES: Record<FleetDriver['status'], string> = {
  active:    'bg-green-100 text-green-700',
  invited:   'bg-blue-100 text-blue-700',
  suspended: 'bg-red-100 text-red-700',
}

/* ── Tab types ───────────────────────────────────────────────── */

type Tab = 'drivers' | 'analytics' | 'policy' | 'invoices'

/* ── Page ───────────────────────────────────────────────────── */

export default function FleetAdminPage() {
  const [fleet, setFleet]       = useState<FleetAccount | null>(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<Tab>('drivers')
  const [inviteEmail, setInvite] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setFleet(await fetchFleetAdmin()) } catch { /* noop */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg(null)
    try {
      await inviteDriver(inviteEmail.trim())
      setInviteMsg(`Invite sent to ${inviteEmail}`)
      setInvite('')
      void load()
    } catch { setInviteMsg('Failed to send invite') }
    finally { setInviting(false) }
  }

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from fleet?`)) return
    await removeDriver(userId)
    void load()
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-green-600" /></div>
  }
  if (!fleet) {
    return <div className="p-8 text-center text-sm text-gray-500">Fleet account not found or you don't have admin access.</div>
  }

  const { analytics: a } = fleet
  const growth = a.lastMonth.totalSpendPence > 0
    ? ((a.thisMonth.totalSpendPence - a.lastMonth.totalSpendPence) / a.lastMonth.totalSpendPence * 100).toFixed(0)
    : null

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">{fleet.companyName} — Fleet Admin</h1>
        <p className="mt-1 text-sm text-gray-500">{fleet.drivers.filter((d) => d.status === 'active').length} active drivers</p>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={<PoundSterling className="h-4 w-4 text-green-600" />} label="This month" value={fmtPence(a.thisMonth.totalSpendPence)} green />
        <KpiCard icon={<Zap className="h-4 w-4 text-blue-600" />} label="Sessions" value={String(a.thisMonth.totalSessions)} />
        <KpiCard icon={<BarChart3 className="h-4 w-4 text-purple-600" />} label="Total kWh" value={a.thisMonth.totalKwh.toFixed(1)} />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-amber-600" />}
          label="vs last month"
          value={growth != null ? `${parseFloat(growth) > 0 ? '+' : ''}${growth}%` : '—'}
        />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {(['drivers', 'analytics', 'policy', 'invoices'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Drivers tab */}
      {tab === 'drivers' && (
        <div>
          {/* Invite */}
          <div className="mb-5 flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="driver@company.com"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleInvite() }}
            />
            <button
              onClick={() => void handleInvite()}
              disabled={inviting || !inviteEmail}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Invite
            </button>
          </div>
          {inviteMsg && (
            <p className={cn('mb-3 text-sm', inviteMsg.startsWith('Failed') ? 'text-red-600' : 'text-green-600')}>{inviteMsg}</p>
          )}

          {/* Driver table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Driver</th>
                  <th className="px-4 py-3 text-right font-medium">Sessions</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">kWh</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fleet.drivers.map((d) => (
                  <tr key={d.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{d.fullName}</p>
                      <p className="text-xs text-gray-400">{d.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{d.thisMonthSessions}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtPence(d.thisMonthSpendPence)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{d.thisMonthKwh.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', STATUS_STYLES[d.status])}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void handleRemove(d.userId, d.fullName)}
                        className="rounded p-1 text-gray-400 hover:text-red-500"
                        title="Remove driver"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policy tab */}
      {tab === 'policy' && (
        <PolicyEditor policy={fleet.policy} onSaved={load} />
      )}

      {/* Analytics tab */}
      {tab === 'analytics' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Usage summary</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <CompareRow label="Total spend" thisVal={fmtPence(a.thisMonth.totalSpendPence)} lastVal={fmtPence(a.lastMonth.totalSpendPence)} />
            <CompareRow label="Sessions" thisVal={String(a.thisMonth.totalSessions)} lastVal={String(a.lastMonth.totalSessions)} />
            <CompareRow label="kWh charged" thisVal={a.thisMonth.totalKwh.toFixed(1)} lastVal={a.lastMonth.totalKwh.toFixed(1)} />
            <CompareRow label="Avg cost/session" thisVal={fmtPence(a.avgCostPerSessionPence)} lastVal="—" />
          </div>
          {a.topDriverName && (
            <div className="mt-4 rounded-lg bg-green-50 border border-green-100 p-3">
              <p className="text-sm text-green-800">
                🏆 <strong>{a.topDriverName}</strong> is this month's top driver by spend.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Invoices tab */}
      {tab === 'invoices' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-900">Monthly invoices</h2>
          <p className="mb-4 text-sm text-gray-500">Download consolidated VAT invoices for your finance team.</p>
          <button
            onClick={() => window.open('/api/v1/fleet/invoice/current', '_blank')}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Download className="h-4 w-4" /> Download this month's invoice
          </button>
        </div>
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

function CompareRow({ label, thisVal, lastVal }: { label: string; thisVal: string; lastVal: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-900">{thisVal}</p>
        <p className="text-xs text-gray-400">vs {lastVal} last month</p>
      </div>
    </div>
  )
}

function PolicyEditor({ policy, onSaved }: { policy: FleetPolicy; onSaved: () => void }) {
  const [maxSession, setMaxSession]   = useState(policy.maxSpendPerSessionPence != null ? String(policy.maxSpendPerSessionPence / 100) : '')
  const [maxMonth, setMaxMonth]       = useState(policy.maxSpendPerMonthPence != null ? String(policy.maxSpendPerMonthPence / 100) : '')
  const [approval, setApproval]       = useState(policy.requiresApproval)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await updatePolicy({
      maxSpendPerSessionPence: maxSession ? Math.round(parseFloat(maxSession) * 100) : null,
      maxSpendPerMonthPence:   maxMonth   ? Math.round(parseFloat(maxMonth) * 100)   : null,
      requiresApproval:        approval,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900">
        <Shield className="h-5 w-5 text-gray-400" /> Spend policy
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <PolicyInput label="Max spend per session (£)" value={maxSession} onChange={setMaxSession} placeholder="e.g. 30.00" />
        <PolicyInput label="Max spend per month (£)" value={maxMonth} onChange={setMaxMonth} placeholder="e.g. 200.00" />
      </div>
      <label className="mt-4 flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={approval}
          onChange={(e) => setApproval(e.target.checked)}
          className="h-4 w-4 rounded accent-green-600"
        />
        Require manager approval for each session
      </label>
      <div className="mt-5 flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : null}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save policy'}
        </button>
      </div>
    </div>
  )
}

function PolicyInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
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
