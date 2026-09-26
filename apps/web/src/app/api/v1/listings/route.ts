/**
 * @file route.ts
 * @description GET /api/v1/listings — geo search
 *              POST /api/v1/listings — create draft listing
 *
 * @module apps/web/api/v1/listings
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ListingService } from '@/domains/charging/ListingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/* ── POST — create draft listing ───────────────────────────── */

const CreateListingSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().max(2000).optional(),
  addressLine1: z.string().min(3).max(200),
  addressLine2: z.string().max(100).optional(),
  city: z.string().min(2).max(100),
  postcode: z.string().min(5).max(10),
  countryCode: z.string().length(2).default('GB'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  chargerLevel: z.enum(['level_1', 'level_2', 'dc_fast', 'dc_ultra_fast']),
  plugTypes: z.array(z.string()).min(1),
  maxPowerKw: z.number().positive().max(400),
  numPorts: z.number().int().min(1).max(100).optional(),
  chargerBrand: z.string().max(80).optional(),
  chargerModel: z.string().max(80).optional(),
  ocppChargePointId: z.string().max(100).optional(),
  isSmartCharger: z.boolean().optional(),
  isNetworked: z.boolean().optional(),
  pricingModel: z.enum(['per_kwh', 'per_hour', 'per_session', 'hybrid']),
  pricePerKwhPence: z.number().int().nonnegative().optional(),
  pricePerHourPence: z.number().int().nonnegative().optional(),
  pricePerSessionPence: z.number().int().nonnegative().optional(),
  idleFeePerMinPence: z.number().int().nonnegative().optional(),
  accessType: z.enum(['always_open', 'gate_code', 'buzz_in', 'key_pickup', 'app_unlock']).optional(),
  accessInstructions: z.string().max(1000).optional(),
  wifiAvailable: z.boolean().optional(),
  restroomAvailable: z.boolean().optional(),
  shelterAvailable: z.boolean().optional(),
  lightingAvailable: z.boolean().optional(),
  wheelchairAccessible: z.boolean().optional(),
  evParkingOnly: z.boolean().optional(),
  instantBookEnabled: z.boolean().optional(),
  minBookingHours: z.number().positive().optional(),
  maxBookingHours: z.number().positive().max(24).optional(),
})

/**
 * POST /api/v1/listings — host creates a new draft listing.
 * @access Requires host role
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  const roles = request.headers.get('x-user-roles')?.split(',') ?? []

  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  if (!roles.includes('host')) return apiError('FORBIDDEN', 'Host role required', 403)

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = CreateListingSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422, parsed.error.flatten())
  }

  try {
    // Look up host_profile_id for this user
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    const profileResult = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    )
    if (profileResult.rows.length === 0) {
      return apiError('HOST_PROFILE_NOT_FOUND', 'Complete your host profile first', 400)
    }
    const hostProfileId = (profileResult.rows[0] as { id: string }).id

    const listing = await ListingService.create({
      ...parsed.data,
      hostProfileId,
      description: parsed.data.description ?? undefined,
      addressLine2: parsed.data.addressLine2 ?? undefined,
      chargerBrand: parsed.data.chargerBrand ?? undefined,
      chargerModel: parsed.data.chargerModel ?? undefined,
      ocppChargePointId: parsed.data.ocppChargePointId ?? undefined,
    })
    return apiResponse(listing, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/listings]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/* ── GET — geo search listings ─────────────────────────────── */

const SearchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(50000).optional(),
  plugTypes: z.string().optional(),
  minPowerKw: z.coerce.number().positive().optional(),
  maxPricePence: z.coerce.number().int().nonnegative().optional(),
  instantBookOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
})

/**
 * GET /api/v1/listings — search chargers near a location.
 * @access Public
 */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const parsed = SearchSchema.safeParse(params)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'lat and lng are required', 422)
  }

  try {
    const searchParams: Parameters<typeof ListingService.searchNearby>[0] = {
      lat: parsed.data.lat,
      lng: parsed.data.lng,
    }
    if (parsed.data.radius !== undefined) searchParams.radiusMetres = parsed.data.radius
    if (parsed.data.plugTypes) searchParams.plugTypes = parsed.data.plugTypes.split(',')
    if (parsed.data.minPowerKw !== undefined) searchParams.minPowerKw = parsed.data.minPowerKw
    if (parsed.data.maxPricePence !== undefined) searchParams.maxPricePence = parsed.data.maxPricePence
    if (parsed.data.instantBookOnly !== undefined) searchParams.instantBookOnly = parsed.data.instantBookOnly
    if (parsed.data.page !== undefined) searchParams.page = parsed.data.page
    if (parsed.data.pageSize !== undefined) searchParams.pageSize = parsed.data.pageSize

    const { listings, total } = await ListingService.searchNearby(searchParams)
    const page = parsed.data.page ?? 1
    const pageSize = parsed.data.pageSize ?? 20
    return apiResponse(listings, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/listings]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
