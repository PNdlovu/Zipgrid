/**
 * @file route.ts
 * @description POST /api/v1/trip/plan — plan charging for a journey in the
 * caller's car (TripPlanner): stops with a best and backup bookable charger,
 * suggested booking windows, costs and arrival time. Doesn't book.
 *
 * Body: { destination, origin? | originLat+originLng, departure, batteryPercent,
 *         vehicleId?, temperatureCelsius? }
 *
 * @module apps/web/api/v1/trip/plan
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { TripPlanner } from '@/domains/trip/TripPlanner'

const PlanSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  origin: z.string().trim().min(2).max(120).optional(),
  originLat: z.number().min(-90).max(90).optional(),
  originLng: z.number().min(-180).max(180).optional(),
  departure: z.string().datetime({ offset: true }),
  batteryPercent: z.number().int().min(1).max(100),
  vehicleId: z.string().uuid().optional(),
  temperatureCelsius: z.number().min(-30).max(50).optional(),
}).refine((d) => d.origin || (d.originLat !== undefined && d.originLng !== undefined), {
  message: 'Enter where you are starting from, or share your location.',
})

/** POST /api/v1/trip/plan */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const parsed = PlanSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input', 422)
    const d = parsed.data
    return apiResponse(await TripPlanner.planForUser({
      userId,
      origin: d.origin ?? { lat: d.originLat!, lng: d.originLng!, label: 'Your location' },
      destination: d.destination,
      departure: new Date(d.departure),
      batteryPercent: d.batteryPercent,
      vehicleId: d.vehicleId,
      temperatureC: d.temperatureCelsius,
    }))
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/trip/plan')
  }
}
