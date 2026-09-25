/**
 * @file bookings.ts
 * @description Typed API client hooks for bookings.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Booking, CreateBookingInput } from '@zipgrid/types'
import { apiClient } from './client'

export const bookingKeys = {
  all: ['bookings'] as const,
  driver: () => ['bookings', 'driver'] as const,
  detail: (id: string) => ['bookings', id] as const,
}

/**
 * Fetches all bookings for the authenticated driver.
 */
export function useDriverBookings() {
  return useQuery({
    queryKey: bookingKeys.driver(),
    queryFn: () => apiClient.get<Booking[]>('/v1/bookings/driver'),
    staleTime: 30_000,
  })
}

/**
 * Fetches a single booking by ID.
 */
export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: () => apiClient.get<Booking>(`/v1/bookings/${id}`),
    enabled: Boolean(id),
  })
}

/**
 * Mutation hook to create a new booking.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      apiClient.post<Booking>('/v1/bookings', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all })
    },
  })
}
