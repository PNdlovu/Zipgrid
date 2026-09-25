/**
 * @file user.ts
 * @description User, driver profile, host profile, and vehicle type definitions.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { UserRole, KycStatus, AiMode } from './enums'

export type User = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  phoneNumber: string | null
  phoneVerified: boolean
  emailVerified: boolean
  kycStatus: KycStatus
  roles: UserRole[]
  aiMode: AiMode
  createdAt: Date
  updatedAt: Date
}

export type DriverProfile = {
  userId: string
  licencePlate: string | null
  preferredConnectors: string[]
  homePostcode: string | null
  trustedDriverBadge: boolean
  responseRate: number | null
  sessionsCompleted: number
  averageRating: number | null
}

export type HostProfile = {
  userId: string
  businessName: string | null
  isSuperhost: boolean
  isSmb: boolean
  superhostSince: Date | null
  responseRate: number
  responseTimeMinutes: number
  totalEarningsPence: number
  listingsCount: number
}

export type DriverVehicle = {
  id: string
  userId: string
  make: string
  model: string
  year: number
  batteryCapacityKwh: number | null
  connectorTypes: string[]
  licencePlate: string
  isDefault: boolean
}
