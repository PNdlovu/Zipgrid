/**
 * @file route.ts
 * @description GET/PATCH/DELETE /api/v1/listings/[id]
 *
 * @module apps/web/api/v1/listings/[id]
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ListingService } from '@/domains/charging/ListingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { geocodeUkPostcode } from '@/lib/geo/postcode'

type Params = { params: Promise<{ id: string }> }

/** GET /api/v1/listings/[id] — public listing detail */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const listing = await ListingService.getById(id)
    return apiResponse(listing)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const UpdateListingSchema = z.object({
  // Basic info
  title:                z.string().min(5).max(120).optional(),
  description:          z.string().max(2000).optional(),
  // Location
  addressLine1:         z.string().min(3).max(200).optional(),
  addressLine2:         z.string().max(200).optional(),
  city:                 z.string().min(2).max(100).optional(),
  postcode:             z.string().min(3).max(10).optional(),
  // Charger specs
  chargerLevel:         z.enum(['level_1', 'level_2', 'dc_fast', 'dc_ultra_fast']).optional(),
  maxPowerKw:           z.number().positive().max(400).optional(),
  chargerBrand:         z.string().max(80).optional(),
  chargerModel:         z.string().max(80).optional(),
  ocppChargePointId:    z.string().max(100).optional(),
  isSmartCharger:       z.boolean().optional(),
  // Pricing
  pricingModel:         z.enum(['per_kwh', 'per_hour', 'per_session', 'hybrid']).optional(),
  pricePerKwhPence:     z.number().int().nonnegative().optional(),
  pricePerHourPence:    z.number().int().nonnegative().optional(),
  pricePerSessionPence: z.number().int().nonnegative().optional(),
  idleFeePerMinPence:   z.number().int().nonnegative().optional(),
  instantBookEnabled:   z.boolean().optional(),
  // Access & amenities
  accessType:           z.enum(['always_open', 'gate_code', 'buzz_in', 'key_pickup', 'app_unlock']).optional(),
  accessInstructions:   z.string().max(1000).optional(),
  wifiAvailable:        z.boolean().optional(),
  restroomAvailable:    z.boolean().optional(),
  shelterAvailable:     z.boolean().optional(),
  lightingAvailable:    z.boolean().optional(),
  wheelchairAccessible: z.boolean().optional(),
  evParkingOnly:        z.boolean().optional(),
  minBookingHours:      z.number().positive().max(72).optional(),
  maxBookingHours:      z.number().positive().max(72).optional(),
  // Status: hosts can pause here; going live always goes through /publish.
  status:               z.enum(['paused']).optional(),
})

/** camelCase → snake_case field name mapping for DB columns that don't follow the pattern */
const FIELD_MAP: Record<string, string> = {
  pricePerKwhPence:     'price_per_kwh_cents',
  pricePerHourPence:    'price_per_hour_cents',
  pricePerSessionPence: 'price_per_session_cents',
  idleFeePerMinPence:   'idle_fee_per_min_cents',
  ocppChargePointId:    'ocpp_charge_point_id',
  isSmartCharger:       'is_smart_charger',
  maxPowerKw:           'max_power_kw',
  chargerLevel:         'charger_level',
  chargerBrand:         'charger_brand',
  chargerModel:         'charger_model',
  addressLine1:         'address_line1',
  addressLine2:         'address_line2',
  instantBookEnabled:   'instant_book_enabled',
  accessType:           'access_type',
  accessInstructions:   'access_instructions',
  wifiAvailable:        'wifi_available',
  restroomAvailable:    'restroom_available',
  shelterAvailable:     'shelter_available',
  lightingAvailable:    'lighting_available',
  evParkingOnly:        'ev_parking_only',
  wheelchairAccessible: 'wheelchair_accessible',
  minBookingHours:      'min_booking_hours',
  maxBookingHours:      'max_booking_hours',
  pricingModel:         'pricing_model',
  postcode:             'postal_code',
}

/** PATCH /api/v1/listings/[id] — update listing fields */
export async function PATCH(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = UpdateListingSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    const db = (await import('@/lib/db')).getDb
    const dbInstance = await db()
    const listing = await ListingService.getById(id)
    const ownerCheck = await dbInstance.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, listing.hostProfileId],
    )
    if (ownerCheck.rows.length === 0) return apiError('FORBIDDEN', 'Not your listing', 403)

    const data: Record<string, unknown> = { ...parsed.data }

    // Pricing must stay measurable: per-kWh needs a connected charger.
    const smart = parsed.data.isSmartCharger ?? listing.isSmartCharger
    const model = parsed.data.pricingModel ?? listing.pricingModel
    if (!smart && (model === 'per_kwh' || model === 'hybrid')) {
      return apiError('VALIDATION_ERROR', 'Per-kWh pricing needs a connected (OCPP) charger.', 422)
    }
    if (parsed.data.ocppChargePointId) {
      const device = await dbInstance.execute(
        `SELECT 1 FROM charger_devices WHERE charge_point_id = $1 AND host_profile_id = $2`,
        [parsed.data.ocppChargePointId, listing.hostProfileId],
      )
      if (device.rows.length === 0) {
        return apiError('CHARGER_NOT_PAIRED', 'Pair this charger to your account before linking it.', 422)
      }
    }
    if (parsed.data.postcode && parsed.data.postcode !== listing.postcode) {
      const geo = await geocodeUkPostcode(parsed.data.postcode)
      if (!geo) return apiError('POSTCODE_NOT_FOUND', 'We could not find that postcode — please check it.', 422)
      data['latitude'] = geo.lat
      data['longitude'] = geo.lng
    }

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1

    for (const [key, val] of Object.entries(data)) {
      if (val === undefined) continue
      // Use explicit mapping if available, otherwise fall back to camelCase→snake_case
      const col = FIELD_MAP[key] ?? key.replace(/([A-Z])/g, '_$1').toLowerCase()
      sets.push(`${col} = $${i++}`)
      vals.push(val)
    }
    if (sets.length === 0) return apiResponse({ updated: false })

    sets.push(`updated_at = NOW()`)
    vals.push(id)
    await dbInstance.execute(`UPDATE charger_listings SET ${sets.join(', ')} WHERE id = $${i}`, vals)
    const updated = await ListingService.getById(id)
    return apiResponse(updated)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** DELETE /api/v1/listings/[id] — deactivate listing */
export async function DELETE(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    const db = await (await import('@/lib/db')).getDb()
    const listing = await ListingService.getById(id)
    const ownerCheck = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, listing.hostProfileId],
    )
    if (ownerCheck.rows.length === 0) return apiError('FORBIDDEN', 'Not your listing', 403)
    await db.execute(
      `UPDATE charger_listings SET status = 'deactivated', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    return apiResponse({ deleted: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
