/**
 * @file listing.ts
 * @description Charger listing type definitions — for the P2P marketplace.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { ListingStatus, ConnectorType } from './enums'

export type GeoPoint = {
  lat: number
  lng: number
}

/** Full charger listing — returned from listing detail endpoint */
export type Listing = {
  id: string
  hostId: string
  status: ListingStatus
  title: string
  description: string | null
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  location: GeoPoint
  /** Distance in metres — present only on search results */
  distanceMetres?: number

  // Charger specs
  brand: string
  model: string
  connectorTypes: ConnectorType[]
  maxPowerKw: number
  numberOfPorts: number

  // Pricing — all in pence
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinutePence: number | null
  peakSurchargePercent: number | null
  instantBook: boolean

  // Amenities
  amenities: ListingAmenity[]

  // Media
  photos: ListingPhoto[]

  // Stats
  averageRating: number | null
  reviewCount: number
  totalSessionsHosted: number

  createdAt: Date
  updatedAt: Date
}

export type ListingAmenity =
  | 'wifi'
  | 'covered_parking'
  | 'lighting'
  | 'toilets'
  | 'cafe_nearby'
  | 'ev_only_bay'

export type ListingPhoto = {
  id: string
  url: string
  thumbnailUrl: string
  isPrimary: boolean
  order: number
}

/** Compact listing used in map clusters and search results */
export type ListingSummary = Pick<
  Listing,
  | 'id'
  | 'title'
  | 'location'
  | 'distanceMetres'
  | 'connectorTypes'
  | 'maxPowerKw'
  | 'pricePerKwhPence'
  | 'pricePerHourPence'
  | 'instantBook'
  | 'averageRating'
  | 'reviewCount'
> & {
  primaryPhotoUrl: string | null
  isAvailableNow: boolean
}

export type ListingSearchParams = {
  lat: number
  lng: number
  radiusMetres?: number
  connectorTypes?: ConnectorType[]
  minPowerKw?: number
  instantBookOnly?: boolean
  availableNow?: boolean
  page?: number
  pageSize?: number
}

// ─────────────────────────────────────────────────────────────
// ACCESSIBILITY & LISTING HEALTH (Planning Baseline v2.3)
// ─────────────────────────────────────────────────────────────

/**
 * Accessibility features declared by the host on a listing.
 * Mirrors the charger_listings ALTER TABLE columns from migration 017.
 */
export type ListingAccessibility = {
  wheelchair: boolean
  visualImpairment: boolean
  stepFree: boolean
  covered: boolean
  lighting: boolean
  toiletNearby: boolean
  familyFriendly: boolean
  bayWidthCm: number | null
  extras: Record<string, boolean | string>
}

/**
 * Point of interest near a listing (cached from Google Places / Overpass).
 * Used by family mode and the AI trip planner.
 */
export type ListingPoi = {
  id: number
  listingId: string
  category: 'toilet' | 'restaurant' | 'cafe' | 'play_area' | 'supermarket' | 'pharmacy' | 'park' | 'hotel' | 'petrol_station'
  name: string
  distanceMetres: number
  googlePlaceId: string | null
  lat: number | null
  lng: number | null
  isAccessible: boolean | null
  lastVerifiedAt: Date
}

/** Severity level for a listing health insight */
export type ListingHealthInsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

/** A single AI-generated insight shown in the host listing health panel */
export type ListingHealthInsight = {
  type: string              // e.g. 'photos_stale', 'price_below_market', 'instructions_unclear'
  severity: ListingHealthInsightSeverity
  message: string           // plain-English description
  actionLabel: string | null
  actionUrl: string | null
}

/** Aggregated listing health score computed by the AI Listing Health Agent */
export type ListingHealthScore = {
  listingId: string
  overallScore: number          // 0–100
  scorePhotos: number | null
  scoreDescription: number | null
  scoreAccessInstructions: number | null
  scorePricing: number | null
  scoreAvailability: number | null
  scoreResponseTime: number | null
  scoreReviews: number | null
  insights: ListingHealthInsight[]
  lastCalculatedAt: Date | null
  nextCheckAt: Date | null
  agentTaskId: string | null
  createdAt: Date
  updatedAt: Date
}

/** Predicted availability for a listing at a specific time slot */
export type ListingAvailabilityPrediction = {
  id: number
  listingId: string
  slotStart: Date
  slotEnd: Date
  /** 0.000–1.000 — show as percentage in UI */
  availabilityProbability: number
  modelConfidence: number | null
  sampleSize: number | null
  modelVersion: string
  createdAt: Date
}

/**
 * Extended listing type including accessibility and health data.
 * Used by the map search and listing detail screens.
 */
export type ListingWithAccessibility = {
  accessibility: ListingAccessibility
  nearbyPois: ListingPoi[]
  healthScore: ListingHealthScore | null
  availabilityPredictions: ListingAvailabilityPrediction[]
}

/** Voice / agent search filters including accessibility needs */
export type AccessibilitySearchFilter = {
  needsWheelchair?: boolean
  needsStepFree?: boolean
  needsCovered?: boolean
  needsLighting?: boolean
  needsToiletNearby?: boolean
  needsFamilyFriendly?: boolean
  plugType?: string
  location?: string
}
