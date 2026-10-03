/**
 * @file route.ts
 * @description POST /api/v1/bookings — create a booking.
 *
 * Pricing, availability, the double-booking lock and the card hold are all
 * handled by BookingService.create; the client only chooses the slot, vehicle
 * and how to pay — a saved card (paymentMethodId) or the wallet (payWithWallet).
 *
 * @module apps/web/api/v1/bookings
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { BookingService } from '@/domains/booking/BookingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const CreateBookingSchema = z.object({
  listingId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  scheduledStart: z.string().datetime({ offset: true, message: 'scheduledStart must be an ISO 8601 datetime' }),
  scheduledEnd: z.string().datetime({ offset: true, message: 'scheduledEnd must be an ISO 8601 datetime' }),
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/, 'Invalid paymentMethodId').optional(),
  payWithWallet: z.boolean().optional().default(false),
}).refine((d) => d.payWithWallet !== Boolean(d.paymentMethodId), {
  message: 'Provide either paymentMethodId or payWithWallet: true',
})

/** POST /api/v1/bookings — create a booking. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)

    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = CreateBookingSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }

    const booking = await BookingService.create({
      userId,
      listingId: parsed.data.listingId,
      vehicleId: parsed.data.vehicleId,
      scheduledStart: new Date(parsed.data.scheduledStart),
      scheduledEnd: new Date(parsed.data.scheduledEnd),
      paymentMethodId: parsed.data.paymentMethodId ?? null,
      payWithWallet: parsed.data.payWithWallet,
    })
    return apiResponse(booking, undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/bookings')
  }
}
