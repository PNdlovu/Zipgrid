/**
 * @file useBookings.ts
 * @description React hook for driver booking list with status filtering and pagination.
 *
 * @module apps/web/hooks
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { useCallback, useEffect, useState } from 'react'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'

export type Booking = {
  id: string
  listingId: string
  status: BookingStatus
  scheduledStart: string
  scheduledEnd: string
  durationMinutes: number
  pricingModel: string
  estimatedCostPence: number
  accessType: string
  instantBook: boolean
  driverArrivalCode: string | null
  sessionPin: string | null
  confirmedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  stripePaymentIntentId: string | null
  listingTitle: string | null
  listingCity: string | null
  listingLatitude: number | null
  listingLongitude: number | null
  hostName: string | null
  createdAt: string
}

export function useBookings(statusFilter?: BookingStatus) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBookings = useCallback(async (p = 1, status?: BookingStatus) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' })
      if (status) params.set('status', status)
      const res = await fetch(`/api/v1/bookings/driver?${params.toString()}`)
      if (!res.ok) {
        setError('Failed to load bookings')
        return
      }
      const data = (await res.json()) as { data: { bookings: Booking[]; total: number } }
      setBookings(p === 1 ? data.data.bookings : (prev) => [...prev, ...data.data.bookings])
      setTotal(data.data.total)
      setPage(p)
    } catch {
      setError('Network error — please check your connection')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBookings(1, statusFilter)
  }, [fetchBookings, statusFilter])

  const cancelBooking = useCallback(async (
    bookingId: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason ?? 'Cancelled by driver' }),
      })
      if (res.ok) {
        // Optimistically update local state
        setBookings((prev) =>
          prev.map((b) =>
            b.id === bookingId
              ? { ...b, status: 'cancelled' as BookingStatus, cancelledAt: new Date().toISOString() }
              : b,
          ),
        )
        return { success: true }
      }
      const body = (await res.json()) as { error?: { message?: string } }
      return { success: false, error: body.error?.message ?? 'Cancellation failed' }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }, [])

  const loadMore = useCallback(() => {
    void fetchBookings(page + 1, statusFilter)
  }, [fetchBookings, page, statusFilter])

  const hasMore = bookings.length < total

  return {
    bookings,
    total,
    loading,
    error,
    cancelBooking,
    loadMore,
    hasMore,
    refetch: () => { void fetchBookings(1, statusFilter) },
  }
}
