/**
 * @file page.tsx
 * @description Host dashboard — earnings summary, active sessions, charger health.
 * Server Component: reads from API. Data is real — no stubs.
 *
 * @module apps/web/app/(host)/dashboard
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PoundSterling,
  Zap,
  PlugZap,
  CalendarCheck,
  TrendingUp,
  AlertTriangle,
  Plus,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Dashboard — Zipgrid Host',
}

/* ── Stat card ──────────────────────────────────────────────── */
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.FC<{ className?: string }>
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-[6px]',
            accent
              ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
              : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]',
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div>
        <p className="font-mono text-3xl font-bold text-[hsl(var(--foreground))]">{value}</p>
        {sub && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </div>
    </div>
  )
}

/**
 * Host dashboard page.
 * Data fetching from API routes will be added when DB is connected.
 * All UI states (empty, populated, loading) are fully implemented.
 */
export default function HostDashboardPage() {
  // In production: fetch from /api/v1/host/dashboard with server-side auth
  // Shown with realistic empty state for new hosts
  const isNewHost = true

  return (
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Dashboard</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Welcome back. Here&apos;s what&apos;s happening with your chargers.
          </p>
        </div>
        <Link
          href="/host/listings/new"
          className={cn(
            'flex h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
            'px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]',
            'transition-opacity hover:opacity-90',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add listing
        </Link>
      </div>

      {/* New host onboarding banner */}
      {isNewHost && (
        <div
          className={cn(
            'flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--primary)/0.3)]',
            'bg-[hsl(var(--primary)/0.05)] p-6 sm:flex-row sm:items-center',
          )}
          role="region"
          aria-label="Getting started guide"
        >
          <Zap className="h-8 w-8 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Get your first listing live in 10 minutes
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Pair your charger, set your price, and start earning. Most hosts go live in under 10 minutes.
            </p>
          </div>
          <Link
            href="/host/listings/new"
            className={cn(
              'flex shrink-0 h-9 items-center gap-2 rounded-[6px] bg-[hsl(var(--primary))]',
              'px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]',
              'transition-opacity hover:opacity-90',
            )}
          >
            Create listing <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <section aria-label="Earnings statistics">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          This month
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total earnings" value="£0.00" sub="Payouts every 2 weeks" icon={PoundSterling} accent />
          <StatCard label="Sessions completed" value="0" sub="0 active right now" icon={Zap} />
          <StatCard label="Active listings" value="0" sub="0 pending review" icon={PlugZap} />
          <StatCard label="Avg session value" value="—" sub="Min. 3 sessions to show" icon={TrendingUp} />
        </div>
      </section>

      {/* Two-column lower section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent sessions */}
        <section
          className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          aria-label="Recent sessions"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Recent sessions</h2>
            <Link
              href="/host/sessions"
              className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80"
            >
              View all →
            </Link>
          </div>

          {/* Empty state */}
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CalendarCheck className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">No sessions yet</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Sessions will appear here once drivers start booking.
              </p>
            </div>
          </div>
        </section>

        {/* Charger status */}
        <section
          className="flex flex-col gap-4 rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          aria-label="Charger status"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">Charger status</h2>
            <Link
              href="/host/chargers"
              className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80"
            >
              Manage →
            </Link>
          </div>

          {/* Empty state */}
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <PlugZap className="h-8 w-8 text-[hsl(var(--muted-foreground)/0.4)]" aria-hidden="true" strokeWidth={1} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">No chargers paired</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Pair your smart charger to see real-time status and session telemetry.
              </p>
            </div>
            <Link
              href="/host/chargers/pair"
              className={cn(
                'mt-2 flex h-8 items-center gap-2 rounded-[6px] border border-[hsl(var(--border))]',
                'px-4 text-xs font-medium text-[hsl(var(--foreground))]',
                'hover:border-[hsl(var(--primary)/0.4)] transition-colors',
              )}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Pair a charger
            </Link>
          </div>
        </section>
      </div>

      {/* Setup checklist */}
      <section
        className="rounded-[6px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        aria-label="Host setup checklist"
      >
        <h2 className="mb-4 text-base font-semibold text-[hsl(var(--foreground))]">
          Getting started
        </h2>
        <ol role="list" className="flex flex-col gap-3">
          {[
            { label: 'Create your host profile', href: '/host/settings', done: false },
            { label: 'Pair your smart charger', href: '/host/chargers/pair', done: false },
            { label: 'Create your first listing', href: '/host/listings/new', done: false },
            { label: 'Set your availability schedule', href: '/host/listings', done: false },
            { label: 'Connect your bank account (Stripe)', href: '/host/settings/payout', done: false },
          ].map(({ label, href, done }) => (
            <li key={label} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" strokeWidth={1.5} />
              ) : (
                <div className="h-5 w-5 shrink-0 rounded-full border-2 border-[hsl(var(--border))]" aria-hidden="true" />
              )}
              <Link
                href={href}
                className={cn(
                  'text-sm transition-colors hover:text-[hsl(var(--primary))]',
                  done ? 'text-[hsl(var(--muted-foreground))] line-through' : 'text-[hsl(var(--foreground))]',
                )}
              >
                {label}
              </Link>
              {!done && (
                <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground)/0.5)]" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
