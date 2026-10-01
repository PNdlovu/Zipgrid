/**
 * @file page.tsx
 * @description /host/vendor — Vendor dashboard for marketplace sellers.
 * Shows sales, order queue, payout status, and reviews for marketplace vendors.
 *
 * @module apps/web/app/(host)/vendor
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ShoppingBag, PoundSterling, Star, Package, Loader2,
  AlertCircle, CheckCircle2, Clock, ArrowRight, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type VendorStats = {
  totalSalesPence: number
  pendingPayoutPence: number
  ordersThisMonth: number
  averageRating: number | null
  reviewCount: number
  activeProducts: number
}

type Order = {
  id: string
  productName: string
  buyerEmail: string
  quantityOrdered: number
  totalPence: number
  status: string
  createdAt: string
  requestedDate: string | null
  notes: string | null
}

/* ── API ─────────────────────────────────────────────────────── */

/** Fetches vendor dashboard data. */
async function fetchVendorDashboard(): Promise<{ stats: VendorStats; orders: Order[] }> {
  const res = await fetch('/api/v1/marketplace/vendor/dashboard', { credentials: 'include' })
  const json = await res.json() as { data?: { stats: VendorStats; orders: Order[] } }
  return { stats: json.data!.stats, orders: json.data?.orders ?? [] }
}

/** Marks an order as complete (releases escrow). */
async function completeOrder(orderId: string): Promise<void> {
  await fetch('/api/v1/marketplace/checkout/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId }),
  })
}

/* ── Helpers ─────────────────────────────────────────────────── */

/** Formats pence as a £ string. */
function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

const STATUS_STYLES: Record<string, string> = {
  hold_placed: 'bg-blue-100 text-blue-700',
  confirmed:   'bg-amber-100 text-amber-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-gray-100 text-gray-500',
}

/* ── Page ───────────────────────────────────────────────────── */

/** Vendor/marketplace seller dashboard. */
export default function VendorDashboardPage() {
  const [stats, setStats]     = useState<VendorStats | null>(null)
  const [orders, setOrders]   = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [completing, setCompleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { stats: s, orders: o } = await fetchVendorDashboard()
      setStats(s)
      setOrders(o)
    } catch {
      setError('Could not load vendor dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleComplete = async (orderId: string) => {
    setCompleting(orderId)
    await completeOrder(orderId)
    await load()
    setCompleting(null)
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
        <p className="text-sm text-red-700">{error ?? 'Not a vendor account'}</p>
      </div>
    )
  }

  const pendingOrders = orders.filter((o) => ['hold_placed', 'confirmed', 'in_progress'].includes(o.status))
  const completedOrders = orders.filter((o) => o.status === 'completed')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Vendor Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your marketplace sales, orders, and payouts.</p>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={<PoundSterling className="h-5 w-5 text-green-600" />} label="Total sales" value={fmtPence(stats.totalSalesPence)} green />
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-amber-500" />} label="Pending payout" value={fmtPence(stats.pendingPayoutPence)} />
        <KpiCard icon={<ShoppingBag className="h-5 w-5 text-blue-600" />} label="Orders this month" value={String(stats.ordersThisMonth)} />
        <KpiCard icon={<Package className="h-5 w-5 text-purple-600" />} label="Active products" value={String(stats.activeProducts)} />
        {stats.averageRating != null && (
          <KpiCard icon={<Star className="h-5 w-5 text-amber-500" />} label="Rating" value={`${stats.averageRating.toFixed(1)} (${stats.reviewCount})`} />
        )}
      </div>

      {/* Quick links */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/marketplace/vendor/products/new" className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
          + Add product
        </Link>
        <Link href="/marketplace/vendor/products" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <Package className="h-4 w-4" /> My products
        </Link>
        <Link href="/marketplace/vendor/payouts" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
          <PoundSterling className="h-4 w-4" /> Payouts
        </Link>
      </div>

      {/* Pending orders */}
      <div className="mb-6">
        <h2 className="mb-3 text-base font-bold text-gray-900">Pending orders ({pendingOrders.length})</h2>
        {pendingOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-400">No pending orders — you're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{order.productName}</p>
                    <p className="text-xs text-gray-500">{order.buyerEmail} · qty {order.quantityOrdered}</p>
                    {order.requestedDate && <p className="text-xs text-gray-400">Requested: {new Date(order.requestedDate).toLocaleDateString('en-GB')}</p>}
                    {order.notes && <p className="mt-1 text-xs text-gray-500 italic">"{order.notes}"</p>}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    <span className="text-base font-bold text-gray-900">{fmtPence(order.totalPence)}</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-600')}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                {['confirmed', 'in_progress'].includes(order.status) && (
                  <button
                    onClick={() => void handleComplete(order.id)}
                    disabled={completing === order.id}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {completing === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Mark as complete & release payment
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent completed orders */}
      {completedOrders.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-bold text-gray-900">Recent completions</h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {completedOrders.slice(0, 5).map((o, i) => (
              <div key={o.id} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t border-gray-100')}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{o.productName}</p>
                  <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString('en-GB')}</p>
                </div>
                <span className="text-sm font-bold text-green-700">{fmtPence(o.totalPence)}</span>
              </div>
            ))}
          </div>
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
      <p className={cn('text-base font-extrabold', green ? 'text-green-700' : 'text-gray-900')}>{value}</p>
    </div>
  )
}
