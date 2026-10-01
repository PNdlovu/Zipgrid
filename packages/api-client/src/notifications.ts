/**
 * @file notifications.ts
 * @description TanStack Query hooks for notifications.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

type NotificationCategory =
  | 'booking_confirmed' | 'booking_cancelled' | 'session_started' | 'session_completed'
  | 'payment_captured' | 'payout_sent' | 'kyc_update' | 'emergency_mode'
  | 'new_review' | 'reward_earned' | 'referral_joined' | 'system_message'

type Notification = {
  id: string
  userId: string
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

type NotificationPreferences = {
  userId: string
  emailEnabled: boolean
  smsEnabled: boolean
  pushEnabled: boolean
  categoriesDisabled: string[]
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unreadOnly: boolean) => ['notifications', 'list', unreadOnly] as const,
  prefs: () => ['notifications', 'preferences'] as const,
}

/** Fetches the notification feed */
export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: () =>
      apiClient.get<NotificationsResponse>('/v1/notifications', {
        params: { unread: unreadOnly, pageSize: 30 },
      }),
    staleTime: 15_000,
    refetchInterval: 30_000, // poll every 30s for new notifications
  })
}

/** Fetches notification delivery preferences */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.prefs(),
    queryFn: () => apiClient.get<NotificationPreferences>('/v1/notifications/preferences'),
    staleTime: 300_000,
  })
}

/** Mutation to mark a single notification as read */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.patch(`/v1/notifications/${notificationId}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

/** Mutation to mark all notifications as read */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/v1/notifications/read-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

/** Mutation to update notification preferences */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (prefs: Partial<Omit<NotificationPreferences, 'userId'>>) =>
      apiClient.patch<NotificationPreferences>('/v1/notifications/preferences', prefs),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.prefs() })
    },
  })
}
