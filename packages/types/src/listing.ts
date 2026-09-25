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
