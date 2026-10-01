/**
 * @file route.ts
 * @description POST /api/v1/bookings — create a booking with Stripe authorization hold.
 *
 * Flow:
 * 1. Validate input (listing, vehicle, schedule, payment method)
 * 2. Fetch listing pricing to calculate estimated cost
 * 3. Ensure driver has a Stripe customer id (create one if not)
 * 4. Create Stripe PaymentIntent with capture_method: 'manual' (hold only)
 * 5. Create booking + transaction row via BookingService
 * 6. Return booking with QR code / PIN
 *
 * @module apps/web/api/v1/bookings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { BookingService } from '@/domains/booking/BookingService'
import { StripeService } from '@/domains/payments/StripeService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const CreateBookingSchema = z.object({
  listingId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  scheduledStart: z.string().datetime({ message: 'scheduledStart must be an ISO 8601 datetime' }),
  scheduledEnd: z.string().datetime({ message: 'scheduledEnd must be an ISO 8601 datetime' }),
  paymentMethodId: z.string().min(1, 'paymentMethodId is required'),
})

/**
 * POST /api/v1/bookings
 * Creates a booking with an authorization hold on the driver's card.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = CreateBookingSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const { listingId, vehicleId, paymentMethodId } = parsed.data
  const scheduledStart = new Date(parsed.data.scheduledStart)
  const scheduledEnd = new Date(parsed.data.scheduledEnd)

  if (scheduledEnd <= scheduledStart) {
    return apiError('VALIDATION_ERROR', 'scheduledEnd must be after scheduledStart', 422)
  }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // ── 1. Fetch listing pricing for cost estimate ─────────────────────
    const listResult = await db.execute(
      `SELECT pricing_model, price_per_kwh_cents, price_per_hour_cents,
              price_per_session_cents, max_power_kw, battery_capacity_kwh
       FROM charger_listings cl
       LEFT JOIN driver_vehicles dv ON dv.id = $2
       WHERE cl.id = $1 AND cl.status = 'active' LIMIT 1`,
      [listingId, vehicleId],
    )

    if (listResult.rows.length === 0) {
      return apiError('NOT_FOUND', 'Listing not found or not available for booking', 404)
    }

    const listing = listResult.rows[0] as {
      pricing_model: string
      price_per_kwh_cents: number | null
      price_per_hour_cents: number | null
      price_per_session_cents: number | null
      max_power_kw: string
      battery_capacity_kwh: string | null
    }

    // ── 2. Calculate estimated cost ────────────────────────────────────
    const durationHours =
      (scheduledEnd.getTime() - scheduledStart.getTime()) / 3_600_000
    const maxPowerKw = parseFloat(listing.max_power_kw)

    let estimatedCostPence = 0
    switch (listing.pricing_model) {
      case 'per_kwh': {
        // Estimate kWh = power × time, capped at battery capacity if known
        const batteryKwh = listing.battery_capacity_kwh
          ? parseFloat(listing.battery_capacity_kwh)
          : null
        const estimatedKwh = Math.min(maxPowerKw * durationHours, batteryKwh ?? 999)
        estimatedCostPence = Math.round(estimatedKwh * (listing.price_per_kwh_cents ?? 35))
        break
      }
      case 'per_hour':
        estimatedCostPence = Math.round(durationHours * (listing.price_per_hour_cents ?? 200))
        break
      case 'per_session':
        estimatedCostPence = listing.price_per_session_cents ?? 500
        break
      case 'hybrid': {
        const batteryKwh = listing.battery_capacity_kwh
          ? parseFloat(listing.battery_capacity_kwh)
          : null
        const estimatedKwh = Math.min(maxPowerKw * durationHours, batteryKwh ?? 999)
        estimatedCostPence =
          (listing.price_per_session_cents ?? 0) +
          Math.round(estimatedKwh * (listing.price_per_kwh_cents ?? 35))
        break
      }
      default:
        estimatedCostPence = 500 // fallback £5
    }

    // Minimum £0.50 hold
    estimatedCostPence = Math.max(estimatedCostPence, 50)

    // ── 3. Ensure driver has a Stripe customer id ──────────────────────
    const userResult = await db.execute(
      `SELECT email, full_name, stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (userResult.rows.length === 0) {
      return apiError('NOT_FOUND', 'User not found', 404)
    }
    const user = userResult.rows[0] as {
      email: string
      full_name: string
      stripe_customer_id: string | null
    }

    let stripeCustomerId = user.stripe_customer_id
    if (!stripeCustomerId) {
      stripeCustomerId = await StripeService.createCustomer(user.email, user.full_name)
      await db.execute(
        `UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2`,
        [stripeCustomerId, userId],
      )
    }

    // ── 4. Create Stripe PaymentIntent (authorization hold) ────────────
    const piResult = await StripeService.createPaymentIntentHold({
      amountPence: estimatedCostPence,
      stripeCustomerId,
      paymentMethodId,
      bookingId: 'pending', // will be updated via metadata after booking created
      description: `Zipgrid charging booking — ${durationHours.toFixed(1)}h`,
    })

    if (!['requires_capture', 'succeeded'].includes(piResult.status)) {
      return apiError(
        'PAYMENT_FAILED',
        'Card authorization failed. Please check your payment method.',
        402,
      )
    }

    // ── 5. Create booking row via BookingService ───────────────────────
    const booking = await BookingService.create({
      userId,
      listingId,
      vehicleId,
      scheduledStart,
      scheduledEnd,
      paymentMethodId,
      stripePaymentIntentId: piResult.paymentIntentId,
      estimatedCostPence,
    })

    return apiResponse(booking, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/bookings]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
