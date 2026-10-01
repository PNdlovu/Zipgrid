/**
 * @file marketplace.ts
 * @description Shared types for the Zipgrid marketplace (products, installers, orders).
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-29
 */

export type ProductCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
}

export type Product = {
  id: string
  vendorId: string
  vendorName: string
  vendorRating: number | null
  categorySlug: string
  name: string
  description: string | null
  pricePence: number
  compareAtPricePence: number | null
  currency: string
  plugTypes: string[]
  compatibleChargerLevels: string[]
  imageUrls: string[]
  stock: number | null
  isFeatured: boolean
  isActive: boolean
  reviewCount: number
  averageRating: number | null
  createdAt: string
}

export type InstallerProfile = {
  id: string
  userId: string
  companyName: string
  tradingName: string | null
  description: string | null
  logoUrl: string | null
  isOzevApproved: boolean     // Office for Zero Emission Vehicles approved
  certifications: string[]    // e.g. ['NAPIT', 'NICEIC', 'City & Guilds']
  serviceCategories: string[] // e.g. ['ev_charger_install', 'solar_panel', 'battery_storage']
  coveragePostcodes: string[]
  coverageRadiusKm: number | null
  averageRating: number | null
  reviewCount: number
  completedJobs: number
  baseChargePence: number | null
  website: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
  distanceKm: number | null
  createdAt: string
}

export type OrderStatus =
  | 'pending'
  | 'hold_placed'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'disputed'

export type Order = {
  id: string
  buyerUserId: string
  productId: string | null
  installerJobId: string | null
  quantity: number
  unitPricePence: number
  totalPence: number
  stripePaymentIntentId: string
  status: OrderStatus
  requestedDate: string | null
  notes: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  updatedAt: string
}

export type InstallerJob = {
  id: string
  installerId: string
  installerName: string
  title: string
  description: string | null
  serviceCategory: string
  quotePence: number
  estimatedDays: number | null
  stripeConnectAccountId: string | null
  status: 'open' | 'booked' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: string
}
