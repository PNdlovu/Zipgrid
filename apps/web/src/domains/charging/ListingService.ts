/**
 * @file ListingService.ts
 * @description Charger listing service — CRUD, publish/pause, geo-search.
 * Owns all queries against charger_listings, listing_availability_schedules,
 * listing_blackout_dates, and listing_photos tables.
 * All monetary values in pence (integer).
 *
 * @module domains/charging
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors/AppError'
import { eventBus } from '@/lib/events/event-bus'
import { distanceMetresSql, withinRadiusSql } from '@/lib/db/geo'
import { HostPlanService } from '@/domains/billing/HostPlanService'

/* ── Types ──────────────────────────────────────────────────── */

export type CreateListingInput = {
  hostProfileId: string
  title: string
  description?: string | undefined
  addressLine1: string
  addressLine2?: string | undefined
  city: string
  postcode: string
  countryCode?: string | undefined
  latitude: number
  longitude: number
  chargerLevel: 'level_1' | 'level_2' | 'dc_fast' | 'dc_ultra_fast'
  plugTypes: string[]
  maxPowerKw: number
  numPorts?: number | undefined
  chargerBrand?: string | undefined
  chargerModel?: string | undefined
  ocppChargePointId?: string | undefined
  isSmartCharger?: boolean | undefined
  isNetworked?: boolean | undefined
  pricingModel: 'per_kwh' | 'per_hour' | 'per_session' | 'hybrid'
  pricePerKwhPence?: number | undefined
  pricePerHourPence?: number | undefined
  pricePerSessionPence?: number | undefined
  idleFeePerMinPence?: number | undefined
  peakSurchargePct?: number | undefined
  peakHoursStart?: string | undefined
  peakHoursEnd?: string | undefined
  accessType?: string | undefined
  accessInstructions?: string | undefined
  wifiAvailable?: boolean | undefined
  restroomAvailable?: boolean | undefined
  shelterAvailable?: boolean | undefined
  lightingAvailable?: boolean | undefined
  wheelchairAccessible?: boolean | undefined
  evParkingOnly?: boolean | undefined
  instantBookEnabled?: boolean | undefined
  minBookingHours?: number | undefined
  maxBookingHours?: number | undefined
}

export type ListingRow = {
  id: string
  hostProfileId: string
  title: string
  description: string | null
  status: string
  addressLine1: string
  city: string
  postcode: string
  latitude: number
  longitude: number
  chargerLevel: string
  plugTypes: string[]
  maxPowerKw: number
  numPorts: number
  chargerBrand: string | null
  chargerModel: string | null
  ocppChargePointId: string | null
  isSmartCharger: boolean
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinPence: number
  instantBookEnabled: boolean
  accessType: string
  accessInstructions: string | null
  wifiAvailable: boolean
  restroomAvailable: boolean
  shelterAvailable: boolean
  lightingAvailable: boolean
  wheelchairAccessible: boolean
  evParkingOnly: boolean
  minBookingHours: number
  maxBookingHours: number
  averageRating: number | null
  reviewCount: number
  totalKwhDelivered: number
  /** Distance from search origin in metres — only present on searchNearby results */
  distanceMetres?: number
  /** Cover photos — only populated by getById() */
  photos: Array<{ id: string; url: string; isCover: boolean }>
  createdAt: Date
  updatedAt: Date
}

/**
 * Listing service — all charger listing operations.
 */
export const ListingService = {
  /**
   * Creates a new listing in draft status.
   * @throws {ValidationError} if host profile does not exist
   * @throws {PlanUpgradeRequiredError} at the host plan's listing limit
   */
  async create(input: CreateListingInput): Promise<ListingRow> {
    await HostPlanService.assertCanAddListing(input.hostProfileId)
    const db = await getDb()
    const id = uuidv4()

    await db.execute(
      `INSERT INTO charger_listings (
        id, host_profile_id, title, description, status,
        address_line1, address_line2, city, state_province, postal_code, country_code,
        latitude, longitude,
        charger_level, plug_types, max_power_kw, num_ports,
        charger_brand, charger_model, ocpp_charge_point_id,
        is_smart_charger, is_networked,
        pricing_model, price_per_kwh_cents, price_per_hour_cents, price_per_session_cents,
        idle_fee_per_min_cents, peak_surcharge_pct, peak_hours_start, peak_hours_end,
        access_type, access_instructions,
        wifi_available, restroom_available, shelter_available,
        lighting_available, wheelchair_accessible, ev_parking_only,
        instant_book_enabled, min_booking_hours, max_booking_hours,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,'draft',
        $5,$6,$7,$7,$8,$9,
        $10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,
        $19,$20,
        $21,$22,$23,$24,
        $25,$26,$27,$28,
        $29,$30,
        $31,$32,$33,$34,$35,$36,
        $37,$38,$39,
        NOW(),NOW()
      )`,
      [
        id, input.hostProfileId, input.title, input.description ?? null,
        input.addressLine1, input.addressLine2 ?? null, input.city, input.postcode, input.countryCode ?? 'GB',
        input.latitude, input.longitude,
        input.chargerLevel, `{${input.plugTypes.join(',')}}`, input.maxPowerKw, input.numPorts ?? 1,
        input.chargerBrand ?? null, input.chargerModel ?? null, input.ocppChargePointId ?? null,
        input.isSmartCharger ?? false, input.isNetworked ?? false,
        input.pricingModel, input.pricePerKwhPence ?? null, input.pricePerHourPence ?? null,
        input.pricePerSessionPence ?? null,
        input.idleFeePerMinPence ?? 10, input.peakSurchargePct ?? 0,
        input.peakHoursStart ?? null, input.peakHoursEnd ?? null,
        input.accessType ?? 'always_open', input.accessInstructions ?? null,
        input.wifiAvailable ?? false, input.restroomAvailable ?? false,
        input.shelterAvailable ?? false, input.lightingAvailable ?? false,
        input.wheelchairAccessible ?? false, input.evParkingOnly ?? false,
        input.instantBookEnabled ?? true, input.minBookingHours ?? 0.5, input.maxBookingHours ?? 8.0,
      ],
    )

    return this.getById(id)
  },

  /**
   * Retrieves a single listing by ID, including photos.
   * @throws {NotFoundError} if not found
   */
  async getById(id: string): Promise<ListingRow> {
    const db = await getDb()

    const [listingResult, photoResult] = await Promise.all([
      db.execute(
        `SELECT id, host_profile_id, title, description, status,
                address_line1, city, postal_code, latitude, longitude,
                charger_level, plug_types, max_power_kw, num_ports,
                charger_brand, charger_model, ocpp_charge_point_id, is_smart_charger,
                pricing_model, price_per_kwh_cents, price_per_hour_cents,
                price_per_session_cents, idle_fee_per_min_cents,
                access_type, access_instructions,
                wifi_available, restroom_available, shelter_available,
                lighting_available, wheelchair_accessible, ev_parking_only,
                min_booking_hours, max_booking_hours,
                instant_book_enabled, average_rating, review_count,
                total_kwh_delivered, created_at, updated_at
         FROM charger_listings WHERE id = $1 LIMIT 1`,
        [id],
      ),
      db.execute(
        `SELECT id, cdn_url AS url, is_cover
         FROM listing_photos
         WHERE listing_id = $1
         ORDER BY display_order ASC, uploaded_at ASC`,
        [id],
      ),
    ])

    if (listingResult.rows.length === 0) throw new NotFoundError('Listing', id)

    const photos = photoResult.rows.map((r) => {
      const p = r as Record<string, unknown>
      return { id: p['id'] as string, url: p['url'] as string, isCover: Boolean(p['is_cover']) }
    })

    return this._mapRow(listingResult.rows[0]!, photos)
  },

  /**
   * Retrieves all listings for a host.
   */
  async getByHostProfile(hostProfileId: string): Promise<ListingRow[]> {
    const db = await getDb()
    const result = await db.execute(
      `SELECT id, host_profile_id, title, description, status,
              address_line1, city, postal_code, latitude, longitude,
              charger_level, plug_types, max_power_kw, num_ports,
              charger_brand, charger_model, ocpp_charge_point_id, is_smart_charger,
              pricing_model, price_per_kwh_cents, price_per_hour_cents,
              price_per_session_cents, idle_fee_per_min_cents,
              access_type, access_instructions,
              wifi_available, restroom_available, shelter_available,
              lighting_available, wheelchair_accessible, ev_parking_only,
              min_booking_hours, max_booking_hours,
              instant_book_enabled, average_rating, review_count,
              total_kwh_delivered, created_at, updated_at
       FROM charger_listings WHERE host_profile_id = $1
       ORDER BY created_at DESC`,
      [hostProfileId],
    )
    return result.rows.map((r) => this._mapRow(r))
  },

  /**
   * Searches active listings within a radius of a point.
   * Bounding-box + haversine on lat/lng (distance in metres).
   */
  async searchNearby(params: {
    lat: number
    lng: number
    radiusMetres?: number | undefined
    plugTypes?: string[] | undefined
    minPowerKw?: number | undefined
    maxPricePence?: number | undefined
    instantBookOnly?: boolean | undefined
    page?: number | undefined
    pageSize?: number | undefined
  }): Promise<{ listings: ListingRow[]; total: number }> {
    const db = await getDb()
    const radius = params.radiusMetres ?? 10000 // 10km default
    const page = params.page ?? 1
    const pageSize = Math.min(params.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const conditions: string[] = [
      `status = 'active'`,
      withinRadiusSql('latitude', 'longitude', '$1', '$2', '$3'),
    ]
    const values: unknown[] = [params.lat, params.lng, radius]
    let i = 4

    if (params.plugTypes?.length) {
      conditions.push(`plug_types @> $${i}::plug_type[]`)
      values.push(`{${params.plugTypes.join(',')}}`)
      i++
    }
    if (params.minPowerKw !== undefined) {
      conditions.push(`max_power_kw >= $${i}`)
      values.push(params.minPowerKw)
      i++
    }
    if (params.maxPricePence !== undefined) {
      conditions.push(`(price_per_kwh_cents <= $${i} OR price_per_kwh_cents IS NULL)`)
      values.push(params.maxPricePence)
      i++
    }
    if (params.instantBookOnly) {
      conditions.push(`instant_book_enabled = TRUE`)
    }

    const where = conditions.join(' AND ')
    const countResult = await db.execute(
      `SELECT COUNT(*)::INT AS total FROM charger_listings WHERE ${where}`,
      values,
    )
    const total = (countResult.rows[0] as { total: number }).total

    const listResult = await db.execute(
      `SELECT id, host_profile_id, title, description, status,
              address_line1, city, postal_code, latitude, longitude,
              charger_level, plug_types, max_power_kw, num_ports,
              charger_brand, charger_model, ocpp_charge_point_id, is_smart_charger,
              pricing_model, price_per_kwh_cents, price_per_hour_cents,
              price_per_session_cents, idle_fee_per_min_cents,
              access_type, access_instructions,
              wifi_available, restroom_available, shelter_available,
              lighting_available, wheelchair_accessible, ev_parking_only,
              min_booking_hours, max_booking_hours,
              instant_book_enabled, average_rating, review_count,
              total_kwh_delivered, created_at, updated_at,
              ${distanceMetresSql('latitude', 'longitude', '$1', '$2')} AS distance_metres
       FROM charger_listings
       WHERE ${where}
       ORDER BY distance_metres
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    )

    return { listings: listResult.rows.map((r) => this._mapRow(r)), total }
  },

  /**
   * Publishes a draft listing (sets status to 'active').
   * @throws {ForbiddenError} if user is not the host
   * @throws {ValidationError} if listing is missing required fields
   */
  async publish(listingId: string, requestingUserId: string): Promise<void> {
    const db = await getDb()
    const listing = await this.getById(listingId)

    // Verify ownership — look up host_profile by user_id
    const hostCheck = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [requestingUserId, listing.hostProfileId],
    )
    if (hostCheck.rows.length === 0) throw new ForbiddenError()

    if (listing.status === 'active') return // already published
    if (listing.status === 'deactivated' || listing.status === 'under_review') {
      throw new ValidationError('This listing is under review by Zipgrid and cannot be published yet.', 'LISTING_UNDER_REVIEW')
    }
    if (!listing.title || listing.latitude === 0 || listing.longitude === 0) {
      throw new ValidationError('Listing is missing required fields (title, location)', 'LISTING_INCOMPLETE')
    }
    const priced =
      (listing.pricingModel === 'per_kwh' && (listing.pricePerKwhPence ?? 0) > 0) ||
      (listing.pricingModel === 'per_hour' && (listing.pricePerHourPence ?? 0) > 0) ||
      (listing.pricingModel === 'per_session' && (listing.pricePerSessionPence ?? 0) > 0) ||
      (listing.pricingModel === 'hybrid' && (listing.pricePerKwhPence ?? 0) > 0)
    if (!priced) throw new ValidationError('Set a price for your charger before publishing.', 'LISTING_UNPRICED')
    if (listing.isSmartCharger && !listing.ocppChargePointId) {
      throw new ValidationError('Link your paired charger before publishing.', 'LISTING_NO_CHARGER')
    }
    const terms = await db.execute(`SELECT insurance_tos_accepted FROM charger_listings WHERE id = $1`, [listingId])
    if (!terms.rows[0]?.['insurance_tos_accepted']) {
      throw new ValidationError('Accept the host safety and insurance terms before publishing.', 'TERMS_NOT_ACCEPTED')
    }

    await db.execute(
      `UPDATE charger_listings SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [listingId],
    )

    eventBus.publish({ type: 'LISTING_PUBLISHED', listingId, hostId: listing.hostProfileId })
  },

  /**
   * Changes a listing's prices (not its pricing model). Only the prices the
   * model uses can be set; new bookings are quoted at the new prices, existing
   * bookings keep the price they were quoted.
   * @throws {ForbiddenError}  if user is not the host
   * @throws {ValidationError} for a price the model doesn't use, or out of range
   */
  async updatePricing(
    listingId: string,
    requestingUserId: string,
    prices: { pricePerKwhPence?: number | undefined; pricePerHourPence?: number | undefined; pricePerSessionPence?: number | undefined },
  ): Promise<ListingRow> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT cl.pricing_model FROM charger_listings cl JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE cl.id = $1 AND hp.user_id = $2`,
      [listingId, requestingUserId],
    )
    const model = res.rows[0]?.['pricing_model'] as string | undefined
    if (!model) throw new ForbiddenError('You can only change prices on your own listings.')

    const uses = {
      pricePerKwhPence: model === 'per_kwh' || model === 'hybrid',
      pricePerHourPence: model === 'per_hour',
      pricePerSessionPence: model === 'per_session' || model === 'hybrid',
    }
    const cols = { pricePerKwhPence: 'price_per_kwh_cents', pricePerHourPence: 'price_per_hour_cents', pricePerSessionPence: 'price_per_session_cents' }
    const sets: string[] = []
    const vals: unknown[] = [listingId]
    for (const key of Object.keys(cols) as (keyof typeof cols)[]) {
      const v = prices[key]
      if (v === undefined) continue
      if (!uses[key]) throw new ValidationError(`This listing is priced ${model.replace('_', ' ')}, so that price doesn't apply.`)
      if (!Number.isInteger(v) || v < 1 || v > 100_000) throw new ValidationError('Prices must be between 1p and £1,000.')
      vals.push(v)
      sets.push(`${cols[key]} = $${vals.length}`)
    }
    if (sets.length === 0) throw new ValidationError('No price to change.')
    await db.execute(`UPDATE charger_listings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals)
    return this.getById(listingId)
  },

  /**
   * Pauses an active listing.
   * @throws {ForbiddenError} if user is not the host
   */
  async pause(listingId: string, requestingUserId: string): Promise<void> {
    const db = await getDb()
    const listing = await this.getById(listingId)

    const hostCheck = await db.execute(
      `SELECT id FROM host_profiles WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [requestingUserId, listing.hostProfileId],
    )
    if (hostCheck.rows.length === 0) throw new ForbiddenError()

    await db.execute(
      `UPDATE charger_listings SET status = 'paused', updated_at = NOW() WHERE id = $1`,
      [listingId],
    )
  },

  /** Maps a raw DB row to a typed ListingRow. Photos must be passed separately for list queries. */
  _mapRow(row: Record<string, unknown>, photos: ListingRow['photos'] = []): ListingRow {
    return {
      id: row['id'] as string,
      hostProfileId: row['host_profile_id'] as string,
      title: row['title'] as string,
      description: (row['description'] as string | null) ?? null,
      status: row['status'] as string,
      addressLine1: row['address_line1'] as string,
      city: row['city'] as string,
      postcode: row['postal_code'] as string,
      latitude: Number(row['latitude']),
      longitude: Number(row['longitude']),
      chargerLevel: row['charger_level'] as string,
      plugTypes: (row['plug_types'] as string[]) ?? [],
      maxPowerKw: Number(row['max_power_kw']),
      numPorts: Number(row['num_ports']),
      chargerBrand: (row['charger_brand'] as string | null) ?? null,
      chargerModel: (row['charger_model'] as string | null) ?? null,
      ocppChargePointId: (row['ocpp_charge_point_id'] as string | null) ?? null,
      isSmartCharger: Boolean(row['is_smart_charger']),
      pricingModel: row['pricing_model'] as string,
      pricePerKwhPence: row['price_per_kwh_cents'] != null ? Number(row['price_per_kwh_cents']) : null,
      pricePerHourPence: row['price_per_hour_cents'] != null ? Number(row['price_per_hour_cents']) : null,
      pricePerSessionPence: row['price_per_session_cents'] != null ? Number(row['price_per_session_cents']) : null,
      idleFeePerMinPence: Number(row['idle_fee_per_min_cents']),
      instantBookEnabled: Boolean(row['instant_book_enabled']),
      accessType: (row['access_type'] as string | null) ?? 'always_open',
      accessInstructions: (row['access_instructions'] as string | null) ?? null,
      wifiAvailable: Boolean(row['wifi_available']),
      restroomAvailable: Boolean(row['restroom_available']),
      shelterAvailable: Boolean(row['shelter_available']),
      lightingAvailable: Boolean(row['lighting_available']),
      wheelchairAccessible: Boolean(row['wheelchair_accessible']),
      evParkingOnly: Boolean(row['ev_parking_only']),
      minBookingHours: Number(row['min_booking_hours'] ?? 0.5),
      maxBookingHours: Number(row['max_booking_hours'] ?? 8),
      averageRating: row['average_rating'] != null ? Number(row['average_rating']) : null,
      reviewCount: Number(row['review_count'] ?? 0),
      totalKwhDelivered: Number(row['total_kwh_delivered'] ?? 0),
      ...(row['distance_metres'] != null ? { distanceMetres: Number(row['distance_metres']) } : {}),
      photos,
      createdAt: new Date(row['created_at'] as string),
      updatedAt: new Date(row['updated_at'] as string),
    }
  },
}
