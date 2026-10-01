/**
 * @file host.ts
 * @description TanStack Query hooks for the host portal.
 * Covers bookings management, listings, earnings, and analytics.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

/* ── Types ─────────────────────────────────────────────────── */

type HostBooking = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  durationMinutes: number
  estimatedCostPence: number
  instantBook: boolean
  listingTitle: string | null
  listingCity: string | null
  hostName: string | null
}

type HostBookingsResponse = {
  bookings: HostBooking[]
  total: number
}

type HostListingSummary = {
  id: string
  title: string
  city: string
  postcode: string
  status: string
  chargerLevel: string
  maxPowerKw: number
  pricePerKwhPence: number | null
  pricingModel: string
  instantBookEnabled: boolean
  averageRating: number | null
  reviewCount: number
  totalSessions: number
  grossRevenuePence: number
  upcomingBookings: number
}

type EarningsSummary = {
  period: string
  sessionCount: number
  grossEarningsPence: number
  platformFeePence: number
  netEarningsPence: number
  totalKwh: number
  avgSessionPence: number
}

type AnalyticsSummary = {
  totalSessions: number
  grossRevenuePence: number
  netRevenuePence: number
  totalKwh: number
  avgSessionPence: number
  utilisationPct: number
}

type AnalyticsResponse = {
  period: string
  sinceDate: string
  summary: AnalyticsSummary
  chargers: Array<{
    listingId: string
    title: string
    city: string
    maxPowerKw: number
    sessions: number
    revenuePence: number
    energyKwh: number
    avgSessionPence: number
  }>
  dailyRevenue: Array<{ date: string; sessions: number; revenuePence: number }>
  peakHoursHeatmap: Array<{ dayOfWeek: number; hourOfDay: number; sessionCount: number }>
}

/* ── Query keys ─────────────────────────────────────────────── */

export const hostKeys = {
  bookings: (status?: string) => ['host', 'bookings', status] as const,
  booking: (id: string)       => ['host', 'bookings', id]     as const,
  listings: (status?: string) => ['host', 'listings', status] as const,
  earnings: (period: string)  => ['host', 'earnings', period] as const,
  analytics: (period: string) => ['host', 'analytics', period] as const,
}

/* ── Bookings ───────────────────────────────────────────────── */

export type HostBookingStatusFilter = 'pending' | 'confirmed' | 'active' | 'completed' | undefined

/**
 * Fetches bookings for the host's listings.
 * @param status - Optional status filter
 */
export function useHostBookings(status?: HostBookingStatusFilter) {
  return useQuery({
    queryKey: hostKeys.bookings(status),
    queryFn: () =>
      apiClient.get<HostBookingsResponse>('/v1/bookings/host', {
        params: status ? { status, pageSize: 50 } : { pageSize: 50 },
      }),
    staleTime: 30_000,
  })
}

/**
 * Mutation to approve a pending booking.
 */
export function useApproveBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiClient.patch('/v1/bookings/host', { bookingId, action: 'approve' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['host', 'bookings'] })
    },
  })
}

/**
 * Mutation to reject a pending booking.
 */
export function useRejectBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      apiClient.patch('/v1/bookings/host', { bookingId, action: 'reject', reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['host', 'bookings'] })
    },
  })
}

/* ── Listings ───────────────────────────────────────────────── */

/**
 * Fetches all listings for the authenticated host with session + revenue stats.
 */
export function useHostListings(status?: string) {
  return useQuery({
    queryKey: hostKeys.listings(status),
    queryFn: () =>
      apiClient.get<HostListingSummary[]>('/v1/host/listings', {
        params: status ? { status } : {},
      }),
    staleTime: 60_000,
  })
}

/* ── Earnings ───────────────────────────────────────────────── */

export type EarningsPeriod = 'today' | 'this_week' | 'this_month' | 'last_month' | 'all_time'

/**
 * Fetches the host's earnings summary for a given period.
 */
export function useHostEarnings(period: EarningsPeriod = 'this_month') {
  return useQuery({
    queryKey: hostKeys.earnings(period),
    queryFn: () =>
      apiClient.get<EarningsSummary>('/v1/host/earnings', { params: { period } }),
    staleTime: 60_000,
  })
}

/* ── Analytics ──────────────────────────────────────────────── */

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '365d'

/**
 * Fetches full analytics for the host's chargers — utilisation,
 * per-charger breakdown, daily revenue, peak-hours heatmap.
 */
export function useHostAnalytics(period: AnalyticsPeriod = '30d', listingId?: string) {
  return useQuery({
    queryKey: [...hostKeys.analytics(period), listingId] as const,
    queryFn: () =>
      apiClient.get<AnalyticsResponse>('/v1/host/analytics', {
        params: listingId ? { period, listingId } : { period },
      }),
    staleTime: 120_000,
  })
}
