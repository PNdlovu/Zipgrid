/**
 * @file page.tsx
 * @description /driver/notifications — In-app notification centre.
 * Lists all unread and read notifications, grouped by date.
 * Supports mark-as-read, mark-all-read, and filter by type.
 *
 * @module apps/web/app/(driver)/notifications
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bell, BellOff, CheckCheck, Loader2, Zap, Calendar,
  PoundSterling, AlertTriangle, Gift, Info, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type NotificationType =
  | 'booking_confirmed' | 'booking_cancelled' | 'booking_reminder'
  | 'session_started' | 'session_completed' | 'idle_fee_warning'
  | 'payout_sent' | 'review_received' | 'emergency_accepted'
  | 'safety_score_update' | 'reward_earned' | 'wallet_topup'
  | 'system' | 'promo'

type Notification = {
  id: string
  type: NotificationType
  title: string
  body: string
  isRead: boolean
  actionUrl: string | null
  createdAt: string
}

type GroupedNotifications = Array<{
  label: string
  notifications: Notification[]
}>

/* ── API ─────────────────────────────────────────────────────── */

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch('/api/v1/notifications?limit=50', { credentials: 'include' })
  const json = await res.json() as { data?: { notifications: Notification[] } }
  return json.data?.notifications ?? []
}

async function markRead(id: string): Promise<void> {
  await fetch(`/api/v1/notifications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ isRead: true }),
  })
}

async function markAllRead(): Promise<void> {
  await fetch('/api/v1/notifications/read-all', {
    method: 'PATCH',
    credentials: 'include',
  })
}

/* ── Helpers ─────────────────────────────────────────────────── */

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  booking_confirmed:   <Calendar className="h-5 w-5 text-green-600" />,
  booking_cancelled:   <Calendar className="h-5 w-5 text-red-500" />,
  booking_reminder:    <Calendar className="h-5 w-5 text-blue-500" />,
  session_started:     <Zap className="h-5 w-5 text-blue-600" />,
  session_completed:   <Zap className="h-5 w-5 text-green-600" />,
  idle_fee_warning:    <AlertTriangle className="h-5 w-5 text-amber-500" />,
  payout_sent:         <PoundSterling className="h-5 w-5 text-green-700" />,
  review_received:     <span className="text-base">⭐</span>,
  emergency_accepted:  <AlertTriangle className="h-5 w-5 text-red-600" />,
  safety_score_update: <span className="text-base">🛡</span>,
  reward_earned:       <Gift className="h-5 w-5 text-purple-600" />,
  wallet_topup:        <PoundSterling className="h-5 w-5 text-emerald-600" />,
  system:              <Info className="h-5 w-5 text-gray-500" />,
  promo:               <Gift className="h-5 w-5 text-amber-600" />,
}

function groupByDate(notifs: Notification[]): GroupedNotifications {
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 86_400_000)
  const thisWeek  = new Date(today.getTime() - 7 * 86_400_000)

  const groups: Record<string, Notification[]> = {}

  for (const n of notifs) {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0)
    let label: string
    if (d.getTime() === today.getTime())     label = 'Today'
    else if (d.getTime() === yesterday.getTime()) label = 'Yesterday'
    else if (d >= thisWeek)                  label = 'This week'
    else                                     label = 'Earlier'
    if (!groups[label]) groups[label] = []
    groups[label]!.push(n)
  }

  const ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']
  return ORDER.filter((k) => groups[k]?.length).map((k) => ({
    label: k,
    notifications: groups[k]!,
  }))
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ── Notification item ──────────────────────────────────────── */

function NotifItem({
  notif, onRead,
}: { notif: Notification; onRead: (id: string) => void }) {
  const isToday = new Date(notif.createdAt).toDateString() === new Date().toDateString()
  const timeStr = isToday ? fmtTime(notif.createdAt) : fmtDate(notif.createdAt)

  const content = (
    <div
      className={cn(
        'flex items-start gap-3.5 px-4 py-4 transition-colors',
        !notif.isRead && 'bg-green-50/50',
        notif.actionUrl ? 'cursor-pointer hover:bg-gray-50' : '',
      )}
      onClick={() => { if (!notif.isRead) onRead(notif.id) }}
      role={notif.isRead ? undefined : 'button'}
      tabIndex={notif.isRead ? undefined : 0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !notif.isRead) onRead(notif.id) }}
      aria-label={notif.isRead ? undefined : `Mark "${notif.title}" as read`}
    >
      {/* Icon */}
      <div className={cn(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
        notif.isRead ? 'bg-gray-100' : 'bg-white shadow-sm ring-1 ring-gray-100',
      )}>
        {TYPE_ICONS[notif.type] ?? <Bell className="h-4 w-4 text-gray-400" />}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm', notif.isRead ? 'font-medium text-gray-700' : 'font-semibold text-gray-900')}>
            {notif.title}
          </p>
          <span className="flex-shrink-0 text-xs text-gray-400">{timeStr}</span>
        </div>
        <p className="mt-0.5 text-sm text-gray-500 leading-snug">{notif.body}</p>
      </div>

      {/* Unread dot + action arrow */}
      <div className="flex flex-shrink-0 flex-col items-center gap-2">
        {!notif.isRead && (
          <span className="h-2 w-2 rounded-full bg-green-500" aria-label="Unread" />
        )}
        {notif.actionUrl && (
          <ChevronRight className="h-4 w-4 text-gray-300" />
        )}
      </div>
    </div>
  )

  if (notif.actionUrl) {
    return (
      <Link href={notif.actionUrl} className="block" onClick={() => { if (!notif.isRead) onRead(notif.id) }}>
        {content}
      </Link>
    )
  }

  return content
}

/* ── Filter tabs ─────────────────────────────────────────────── */

type FilterKey = 'all' | 'unread' | 'sessions' | 'bookings' | 'payments'

const FILTER_TYPES: Record<FilterKey, NotificationType[] | null> = {
  all:      null,
  unread:   null, // special case
  sessions: ['session_started', 'session_completed', 'idle_fee_warning'],
  bookings: ['booking_confirmed', 'booking_cancelled', 'booking_reminder'],
  payments: ['payout_sent', 'wallet_topup', 'reward_earned'],
}

/* ── Page ───────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const [all, setAll]               = useState<Notification[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<FilterKey>('all')
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAll(await fetchNotifications())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleRead = useCallback(async (id: string) => {
    setAll((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n))
    await markRead(id)
  }, [])

  const handleMarkAll = async () => {
    setMarkingAll(true)
    await markAllRead()
    setAll((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setMarkingAll(false)
  }

  // Apply filter
  const filtered = all.filter((n) => {
    if (filter === 'unread') return !n.isRead
    const types = FILTER_TYPES[filter]
    if (types) return types.includes(n.type)
    return true
  })

  const unreadCount = all.filter((n) => !n.isRead).length
  const groups = groupByDate(filtered)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="mt-0.5 text-sm text-gray-500">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => void handleMarkAll()}
            disabled={markingAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark all read
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {(['all', 'unread', 'sessions', 'bookings', 'payments'] as FilterKey[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              filter === f
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {f}
            {f === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] text-white">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-green-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <BellOff className="mb-4 h-12 w-12 text-gray-200" />
          <h3 className="text-base font-semibold text-gray-700">
            {filter === 'unread' ? 'All caught up!' : 'No notifications'}
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            {filter === 'unread'
              ? 'You have no unread notifications.'
              : "We'll notify you about bookings, sessions, and payments here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {groups.map((group, gi) => (
            <div key={group.label}>
              {/* Date group label */}
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
              </div>
              {/* Notifications */}
              {group.notifications.map((n, ni) => (
                <div
                  key={n.id}
                  className={cn(
                    ni < group.notifications.length - 1 && 'border-b border-gray-100',
                  )}
                >
                  <NotifItem notif={n} onRead={handleRead} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
