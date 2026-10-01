/**
 * @file route.ts
 * @description DELETE /api/v1/vehicles/[vehicleId] — soft-delete a vehicle.
 *
 * Sets `is_active = false` on the vehicle row. Cannot delete the only vehicle
 * if it is the primary (the driver would have no vehicle for bookings).
 * If the deleted vehicle was the primary, the next vehicle is auto-promoted.
 *
 * @module apps/web/api/v1/vehicles/[vehicleId]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ vehicleId: string }> }

/** Resolves the driver_profile row and verifies the vehicle belongs to this user. */
async function resolveOwnership(vehicleId: string, userId: string) {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()

  const dpRes = await db.execute(
    `SELECT id FROM driver_profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  )
  if (dpRes.rows.length === 0) {
    throw new ValidationError('Driver profile not found.')
  }
  const driverProfileId = (dpRes.rows[0] as { id: string }).id

  const vehRes = await db.execute(
    `SELECT id, is_primary, is_active
     FROM driver_vehicles
     WHERE id = $1 AND driver_profile_id = $2
     LIMIT 1`,
    [vehicleId, driverProfileId],
  )
  if (vehRes.rows.length === 0) {
    throw new NotFoundError('Vehicle', vehicleId)
  }

  const vehicle = vehRes.rows[0] as { id: string; is_primary: boolean; is_active: boolean }
  if (!vehicle.is_active) throw new NotFoundError('Vehicle', vehicleId)

  return { db, driverProfileId, vehicle }
}

/**
 * DELETE /api/v1/vehicles/[vehicleId]
 * Soft-deletes the vehicle (is_active = false).
 * If it was the primary, the next active vehicle is promoted to primary.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { vehicleId } = await params

  try {
    const { db, driverProfileId, vehicle } = await resolveOwnership(vehicleId, userId)

    // Prevent deleting the only remaining vehicle
    const countRes = await db.execute(
      `SELECT COUNT(*)::INT AS cnt FROM driver_vehicles
       WHERE driver_profile_id = $1 AND is_active = TRUE`,
      [driverProfileId],
    )
    if ((countRes.rows[0] as { cnt: number }).cnt <= 1) {
      return apiError(
        'LAST_VEHICLE',
        'Cannot remove your only vehicle. Add another vehicle first.',
        409,
      )
    }

    // Soft-delete
    await db.execute(
      `UPDATE driver_vehicles
       SET is_active = false, is_primary = false, updated_at = NOW()
       WHERE id = $1`,
      [vehicleId],
    )

    // If it was the primary, promote the next vehicle
    if (vehicle.is_primary) {
      await db.execute(
        `UPDATE driver_vehicles
         SET is_primary = true, updated_at = NOW()
         WHERE id = (
           SELECT id FROM driver_vehicles
           WHERE driver_profile_id = $1 AND is_active = TRUE
           ORDER BY created_at ASC LIMIT 1
         )`,
        [driverProfileId],
      )
    }

    return apiResponse({ deleted: true, vehicleId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
