/**
 * @file route.ts
 * @description POST /api/v1/emergency — create an emergency charging request.
 * Finds active listings within the driver's remaining range, creates an
 * emergency_session record, flags the nearest 5 hosts with an SOS notification.
 *
 * GET /api/v1/emergency — get current emergency session status.
 *
 * Range calculation:
 *   max_range_metres = battery_pct × vehicle_range_km × 1000 × 0.85
 *   (85% of theoretical range to ensure arrival with buffer)
 *
 * @module apps/web/api/v1/emergency
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { distanceMetresSql, withinRadiusSql } from '@/lib/db/geo'

const EmergencySchema = z.object({
  batteryPct: z.number().int().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  vehicleId: z.string().uuid().optional(),
  /** Driver's vehicle range in km at full charge — used for range calculation */
  vehicleRangeKm: z.number().positive().max(1000).optional(),
  plugTypes: z.array(z.string()).optional(),
})

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = EmergencySchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  const { batteryPct, lat, lng, vehicleId, plugTypes } = parsed.data

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Resolve vehicle range if not supplied — look up from driver_vehicles
    let vehicleRangeKm = parsed.data.vehicleRangeKm ?? 200  // fallback 200km
    let resolvedVehicleId = vehicleId
    if (!vehicleRangeKm && vehicleId) {
      const vRes = await db.execute(
        `SELECT battery_capacity_kwh, plug_types FROM driver_vehicles WHERE id = $1 LIMIT 1`,
        [vehicleId],
      )
      if (vRes.rows.length > 0) {
        const v = vRes.rows[0] as { battery_capacity_kwh: string | null; plug_types: string[] }
        // Rough range estimate: 5 km per kWh (average UK EV)
        vehicleRangeKm = v.battery_capacity_kwh ? Number(v.battery_capacity_kwh) * 5 : 200
      }
    }
    if (!resolvedVehicleId) {
      // Auto-select primary vehicle
      const pvRes = await db.execute(
        `SELECT dv.id FROM driver_vehicles dv
         JOIN driver_profiles dp ON dp.id = dv.driver_profile_id
         WHERE dp.user_id = $1 AND dv.is_primary = TRUE LIMIT 1`,
        [userId],
      )
      if (pvRes.rows.length > 0) {
        resolvedVehicleId = (pvRes.rows[0] as { id: string }).id
      }
    }

    // Calculate max driveable range in metres (85% buffer for safety)
    const maxRangeMetres = Math.round(batteryPct * vehicleRangeKm * 1000 * 0.85 / 100)

    // ── Find available listings within range ───────────────────
    let plugWhere = ''
    const plugValues: unknown[] = []
    if (plugTypes?.length) {
      plugValues.push(`{${plugTypes.join(',')}}`)
      plugWhere = `AND cl.plug_types && $4::plug_type[]`
    }

    const listingsRes = await db.execute(
      `SELECT cl.id, cl.title, cl.city, cl.latitude, cl.longitude,
              cl.max_power_kw, cl.price_per_kwh_cents,
              cl.instant_book_enabled,
              cl.ocpp_charge_point_id,
              hp.user_id AS host_user_id,
              ${distanceMetresSql('cl.latitude', 'cl.longitude', '$1', '$2')} AS distance_m
       FROM charger_listings cl
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE cl.status = 'active'
         AND ${withinRadiusSql('cl.latitude', 'cl.longitude', '$1', '$2', '$3')}
         ${plugWhere}
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.listing_id = cl.id
             AND b.status IN ('pending','confirmed')
             AND b.scheduled_start <= NOW() + INTERVAL '2 hours'
         )
       ORDER BY distance_m ASC
       LIMIT 10`,
      [lat, lng, maxRangeMetres, ...plugValues],
    )

    // ── Create emergency session record ───────────────────────
    const sessionId = uuidv4()
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString() // 5 minute window

    const topListingIds = (listingsRes.rows as Array<{ id: string }>).slice(0, 5).map((r) => r.id)

    await db.execute(
      `INSERT INTO emergency_sessions (
         id, driver_user_id, vehicle_id, battery_pct,
         current_lat, current_lng,
         max_range_metres, status,
         alerted_listing_ids, platform_fee_waived,
         expires_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6,
         $7, 'host_alerted',
         $8::uuid[], TRUE,
         $9, NOW(), NOW()
       )`,
      [
        sessionId, userId, resolvedVehicleId ?? null, batteryPct,
        lat, lng,
        maxRangeMetres,
        `{${topListingIds.join(',')}}`,
        expiresAt,
      ],
    )

    // ── Notify nearest hosts ───────────────────────────────────
    const alertedListings = (listingsRes.rows as Array<Record<string, unknown>>).slice(0, 5)
    for (const listing of alertedListings) {
      await db.execute(
        `INSERT INTO notifications (
           id, user_id, channel, type, title, body,
           action_url, delivery_status, created_at, scheduled_for
         ) VALUES ($1, $2, 'push', 'new_booking_request',
           '⚡ Emergency charging request',
           $3, $4, 'queued', NOW(), NOW())`,
        [
          uuidv4(),
          listing['host_user_id'] as string,
          `A driver has ${batteryPct}% battery and is ${Math.round(Number(listing['distance_m']) / 1000 * 10) / 10}km away. Can you help?`,
          `/host/dashboard?emergency=${sessionId}`,
        ],
      ).catch(() => { /* notification failure is non-fatal */ })
    }

    return apiResponse({
      emergencySessionId: sessionId,
      batteryPct,
      maxRangeMetres,
      listingsFound: listingsRes.rows.length,
      listings: (listingsRes.rows as Array<Record<string, unknown>>).map((r) => ({
        id: r['id'],
        title: r['title'],
        city: r['city'],
        latitude: Number(r['latitude']),
        longitude: Number(r['longitude']),
        maxPowerKw: Number(r['max_power_kw']),
        pricePerKwhPence: r['price_per_kwh_cents'] != null ? Number(r['price_per_kwh_cents']) : null,
        instantBookEnabled: Boolean(r['instant_book_enabled']),
        distanceMetres: Math.round(Number(r['distance_m'])),
      })),
      expiresAt,
      platformFeeWaived: true,
    }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/emergency]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `SELECT id, status, battery_pct, max_range_metres,
              alerted_listing_ids, accepted_listing_id, resulting_booking_id,
              expires_at, created_at
       FROM emergency_sessions
       WHERE driver_user_id = $1
         AND status NOT IN ('expired','cancelled')
         AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )

    if (res.rows.length === 0) return apiResponse(null)
    return apiResponse(res.rows[0])
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
