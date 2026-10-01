/**
 * @file route.ts
 * @description POST /api/v1/vehicles/[vehicleId]/default
 * Sets the specified vehicle as the driver's primary/default vehicle.
 * Clears `is_primary` on all other vehicles for this driver profile atomically.
 *
 * @module apps/web/api/v1/vehicles/[vehicleId]/default
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ vehicleId: string }> }

/**
 * POST /api/v1/vehicles/[vehicleId]/default
 * Atomically clears is_primary on all driver vehicles, then sets it on this one.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { vehicleId } = await params

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Resolve driver profile
    const dpRes = await db.execute(
      `SELECT id FROM driver_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (dpRes.rows.length === 0) {
      throw new ValidationError('Driver profile not found.')
    }
    const driverProfileId = (dpRes.rows[0] as { id: string }).id

    // Verify vehicle ownership and active status
    const vehRes = await db.execute(
      `SELECT id FROM driver_vehicles
       WHERE id = $1 AND driver_profile_id = $2 AND is_active = TRUE
       LIMIT 1`,
      [vehicleId, driverProfileId],
    )
    if (vehRes.rows.length === 0) {
      throw new NotFoundError('Vehicle', vehicleId)
    }

    // Atomic swap: clear all, then set this one
    await db.execute(
      `UPDATE driver_vehicles
       SET is_primary = (id = $1), updated_at = NOW()
       WHERE driver_profile_id = $2 AND is_active = TRUE`,
      [vehicleId, driverProfileId],
    )

    return apiResponse({ isDefault: true, vehicleId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
