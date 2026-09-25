/**
 * @file booking.ts
 * @description Booking and reservation type definitions.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { BookingStatus } from './enums'

export type Booking = {
  id: string
  driverId: string
  hostId: string
  listingId: string
  vehicleId: string
  status: BookingStatus
  scheduledStart: Date
  scheduledEnd: Date
  accessPin: string | null
  qrCodeUrl: string | null

  // Pricing — all in pence
  estimatedCostPence: number
  finalCostPence: number | null
  platformFeePence: number | null

  // Stripe
  stripePaymentIntentId: string | null

  cancelledAt: Date | null
  cancelledBy: 'driver' | 'host' | 'platform' | null
  cancellationReason: string | null

  createdAt: Date
  updatedAt: Date
}

export type CreateBookingInput = {
  listingId: string
  vehicleId: string
  scheduledStart: Date
  scheduledEnd: Date
  paymentMethodId: string
}

export type CancelBookingInput = {
  bookingId: string
  reason?: string
}
