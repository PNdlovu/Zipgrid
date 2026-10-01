/**
 * @file route.ts
 * @description GET /api/v1/vehicles — list authenticated driver's registered vehicles.
 *              POST /api/v1/vehicles — add a new vehicle.
 *
 * Used by: booking flow (vehicle selector), emergency page, product compatibility checker.
 *
 * @module apps/web/api/v1/vehicles
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const AddVehicleSchema = z.object({
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: z.string().max(40).optional(),
  licensePlate: z.string().max(20).optional(),
  plugTypes: z.array(z.string()).min(1),
  batteryCapacityKwh: z.number().positive().max(200).optional(),
  isPrimary: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const primaryOnly = request.nextUrl.searchParams.get('primary') === 'true'

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Get driver_profile_id
    const dpRes = await db.execute(
      `SELECT id FROM driver_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (dpRes.rows.length === 0) return apiResponse([])

    const driverProfileId = (dpRes.rows[0] as { id: string }).id
    const primaryClause = primaryOnly ? `AND is_primary = TRUE` : ''

    const res = await db.execute(
      `SELECT id, make, model, year, color, license_plate,
              plug_types, battery_capacity_kwh, is_primary, is_active
       FROM driver_vehicles
       WHERE driver_profile_id = $1 AND is_active = TRUE ${primaryClause}
       ORDER BY is_primary DESC, created_at ASC`,
      [driverProfileId],
    )

    return apiResponse(
      res.rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          id: row['id'] as string,
          make: row['make'] as string,
          model: row['model'] as string,
          year: Number(row['year']),
          color: (row['color'] as string | null) ?? null,
          licensePlate: (row['license_plate'] as string | null) ?? null,
          plugTypes: (row['plug_types'] as string[]) ?? [],
          batteryCapacityKwh: row['battery_capacity_kwh'] != null ? Number(row['battery_capacity_kwh']) : null,
          isPrimary: Boolean(row['is_primary']),
        }
      }),
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/vehicles]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = AddVehicleSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const dpRes = await db.execute(
      `SELECT id FROM driver_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (dpRes.rows.length === 0) return apiError('NOT_FOUND', 'Driver profile not found', 404)
    const driverProfileId = (dpRes.rows[0] as { id: string }).id

    // If marking as primary, clear existing primary flag
    if (parsed.data.isPrimary) {
      await db.execute(
        `UPDATE driver_vehicles SET is_primary = FALSE WHERE driver_profile_id = $1`,
        [driverProfileId],
      )
    }

    const vehicleId = uuidv4()
    await db.execute(
      `INSERT INTO driver_vehicles
         (id, driver_profile_id, make, model, year, color, license_plate,
          plug_types, battery_capacity_kwh, is_primary, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::plug_type[], $9, $10, TRUE, NOW(), NOW())`,
      [
        vehicleId, driverProfileId,
        parsed.data.make, parsed.data.model, parsed.data.year,
        parsed.data.color ?? null, parsed.data.licensePlate ?? null,
        `{${parsed.data.plugTypes.join(',')}}`,
        parsed.data.batteryCapacityKwh ?? null,
        parsed.data.isPrimary ?? false,
      ],
    )

    return apiResponse({ id: vehicleId, ...parsed.data }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/vehicles]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
