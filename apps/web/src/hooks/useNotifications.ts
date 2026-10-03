/**
 * @file useNotifications.ts
 * @description React hook for the notification feed.
 * Polls every 30 seconds for new notifications while mounted.
 * Provides markRead and markAllRead actions.
 *
 * @module apps/web/hooks
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/* ── Types ─────────────────────────────────────────────────── */

export type NotificationCategory =
  | 'booking_confirmed' | 'booking_cancelled'
  | 'session_started'  | 'session_completed'
  | 'payment_captured' | 'payment_issue' | 'payout_sent'
  | 'kyc_update'       | 'emergency_mode'
  | 'new_review'       | 'reward_earned'
  | 'referral_joined'  | 'system_message'

export type Notification = {
  id: string
  category: NotificationCategory
  title: string
  body: string
  actionUrl: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

type NotificationsResponse = {
  notifications: Notification[]
  total: number
  unreadCount: number
}

const POLL_INTERVAL_MS = 30_000

/* ── Hook ──────────────────────────────────────────────────── */

export function useNotifications(unreadOnly = false) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [total,         setTotal]         = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams({
        pageSize: '30',
        ...(unreadOnly ? { unread: 'true' } : {}),
      })
      const res = await fetch(`/api/v1/notifications?${params.toString()}`)
      if (!res.ok) { setError('Failed to load notifications'); return }
      const data = (await res.json()) as { data: NotificationsResponse }
      setNotifications(data.data.notifications ?? [])
      setUnreadCount(data.data.unreadCount ?? 0)
      setTotal(data.data.total ?? 0)
      setError(null)
    } catch {
      setError('Network error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [unreadOnly])

  useEffect(() => {
    void fetchNotifications()
    intervalRef.current = setInterval(() => { void fetchNotifications(true) }, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchNotifications])

  /** Marks a single notification as read and updates local state. */
  const markRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n),
    )
    setUnreadCount((c) => Math.max(0, c - 1))

    try {
      await fetch(`/api/v1/notifications/${notificationId}`, { method: 'PATCH' })
    } catch {
      // Silently fail — the optimistic update remains; background poll will reconcile
    }
  }, [])

  /** Marks all notifications as read. */
  const markAllRead = useCallback(async () => {
    // Optimistic update
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: now })))
    setUnreadCount(0)

    try {
      await fetch('/api/v1/notifications/read-all', { method: 'POST' })
    } catch {
      // Silently fail; next poll will return the server state
    }
  }, [])

  return {
    notifications,
    unreadCount,
    total,
    loading,
    error,
    markRead,
    markAllRead,
    refetch: () => { void fetchNotifications() },
  }
}
