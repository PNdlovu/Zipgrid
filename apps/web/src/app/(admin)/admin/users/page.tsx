/**
 * @file page.tsx
 * @description /admin/users — User management table with search, KYC status filter,
 * account status filter, and inline actions (suspend/activate/verify KYC).
 *
 * @module apps/web/app/(admin)/admin/users
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, CheckCircle2, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, Loader2, MoreHorizontal,
  ShieldCheck, ShieldX, UserX, UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type UserRow = {
  id: string; email: string; full_name: string; roles: string[]
  account_status: string; kyc_status: string; kyc_verified_at: string | null
  created_at: string; booking_count: number; has_stripe: boolean
}

/* ── Status badges ───────────────────────────────────────────── */

const KYC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not started', color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--secondary))]' },
  pending:     { label: 'Pending',     color: 'text-yellow-600',                     bg: 'bg-yellow-500/10' },
  verified:    { label: 'Verified',    color: 'text-[hsl(var(--primary))]',          bg: 'bg-[hsl(var(--primary)/0.1)]' },
  failed:      { label: 'Failed',      color: 'text-[hsl(var(--destructive))]',      bg: 'bg-[hsl(var(--destructive)/0.1)]' },
}

const ACCOUNT_CONFIG: Record<string, { label: string; color: string }> = {
  pending_verification: { label: 'Pending verification', color: 'text-yellow-600' },
  active:               { label: 'Active',               color: 'text-[hsl(var(--primary))]' },
  suspended:            { label: 'Suspended',            color: 'text-[hsl(var(--destructive))]' },
  deactivated:          { label: 'Deactivated',          color: 'text-[hsl(var(--muted-foreground))]' },
}

/* ── Action menu ─────────────────────────────────────────────── */

function ActionMenu({ user, onAction }: {
  user: UserRow
  onAction: (userId: string, action: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isSuspended = user.account_status === 'suspended'
  const isKycPending = user.kyc_status === 'pending'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Actions for ${user.full_name}`}
        className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-1 shadow-lg">
            {isSuspended ? (
              <button type="button" onClick={() => { onAction(user.id, 'activate'); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Activate account
              </button>
            ) : (
              <button type="button" onClick={() => { onAction(user.id, 'suspend'); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.06)]">
                <UserX className="h-3.5 w-3.5" aria-hidden="true" /> Suspend account
              </button>
            )}
            {isKycPending && (
              <>
                <button type="button" onClick={() => { onAction(user.id, 'verify_kyc'); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verify KYC
                </button>
                <button type="button" onClick={() => { onAction(user.id, 'reject_kyc'); setOpen(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.06)]">
                  <ShieldX className="h-3.5 w-3.5" aria-hidden="true" /> Reject KYC
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

const PAGE_SIZE = 50

/** Page at /admin/users — User management table with search, KYC status filter, account status filter, and inline actions (suspend/activate/verify KYC). */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kycFilter, setKycFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const fetchUsers = useCallback(async (p: number) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) })
      if (query) params.set('q', query)
      if (kycFilter) params.set('kyc', kycFilter)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/v1/admin/users?${params}`)
      const json = await res.json() as { success: boolean; data?: UserRow[]; meta?: { total?: number }; error?: { message: string } }
      if (json.success) { setUsers(json.data ?? []); setTotal(json.meta?.total ?? 0) }
      else setError(json.error?.message ?? 'Failed to load')
    } finally { setLoading(false) }
  }, [query, kycFilter, statusFilter])

  useEffect(() => { setPage(1); void fetchUsers(1) }, [fetchUsers])

  const handleAction = async (userId: string, action: string) => {
    setActionLoading(userId)
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      const json = await res.json() as { success: boolean; error?: { message: string } }
      if (json.success) {
        setActionSuccess(userId)
        setTimeout(() => setActionSuccess(null), 2000)
        void fetchUsers(page)
      } else setError(json.error?.message ?? 'Action failed')
    } finally { setActionLoading(null) }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Users</h1>
        <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{total.toLocaleString()} total accounts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search email or name…" aria-label="Search users"
            className="w-full rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-2 pl-9 pr-4 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]" />
        </div>
        <select value={kycFilter} onChange={(e) => setKycFilter(e.target.value)} aria-label="Filter by KYC status"
          className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none">
          <option value="">All KYC</option>
          <option value="not_started">Not started</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="failed">Failed</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by account status"
          className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:outline-none">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending_verification">Pending verification</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-3">
          <AlertCircle className="h-4 w-4 text-[hsl(var(--destructive))]" aria-hidden="true" />
          <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-[6px] border border-[hsl(var(--border))]">
        <table className="w-full text-sm" role="table">
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)]">
            <tr>
              {['Name / Email', 'Roles', 'KYC', 'Account', 'Bookings', 'Joined', ''].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[hsl(var(--muted-foreground))]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">No users found.</td></tr>
            ) : users.map((user) => {
              const kyc = KYC_CONFIG[user.kyc_status] ?? KYC_CONFIG['not_started']!
              const acct = ACCOUNT_CONFIG[user.account_status] ?? ACCOUNT_CONFIG['active']!
              const isSucceeded = actionSuccess === user.id
              return (
                <tr key={user.id} className={cn('border-b border-[hsl(var(--border)/0.5)] last:border-0 transition-colors',
                  isSucceeded ? 'bg-[hsl(var(--primary)/0.04)]' : 'hover:bg-[hsl(var(--secondary)/0.3)]')}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[hsl(var(--foreground))]">{user.full_name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((r) => (
                        <span key={r} className="rounded-[3px] bg-[hsl(var(--secondary))] px-1.5 py-0.5 text-[10px] capitalize text-[hsl(var(--muted-foreground))]">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', kyc.bg, kyc.color)}>
                      {kyc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {user.account_status === 'active' ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" aria-hidden="true" />
                        : user.account_status === 'suspended' ? <XCircle className="h-3.5 w-3.5 text-[hsl(var(--destructive))]" aria-hidden="true" />
                        : <AlertCircle className="h-3.5 w-3.5 text-yellow-500" aria-hidden="true" />}
                      <span className={cn('text-xs', acct.color)}>{acct.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{user.booking_count}</td>
                  <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                    {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    {actionLoading === user.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Processing" />
                      : <ActionMenu user={user} onAction={handleAction} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Page {page} of {totalPages} · {total.toLocaleString()} users
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { const p = page - 1; setPage(p); void fetchUsers(p) }} disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] disabled:opacity-40" aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => { const p = page + 1; setPage(p); void fetchUsers(p) }} disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[hsl(var(--border))] disabled:opacity-40" aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
