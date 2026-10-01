/**
 * @file fleet.ts
 * @description Shared TypeScript types for corporate fleet accounts.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-29
 */

export type FleetMemberRole   = 'fleet_admin' | 'driver'
export type FleetMemberStatus = 'invited' | 'active' | 'suspended' | 'removed'
export type FleetInvoiceStatus = 'current' | 'pending' | 'overdue'

export type FleetAccount = {
  id: string
  companyName: string
  companyRegistration: string | null
  vatNumber: string | null
  maxSpendPerSessionPence: number | null
  maxSpendPerMonthPence: number | null
  allowedListingTypes: string[]
  requiresApproval: boolean
  invoiceStatus: FleetInvoiceStatus
  billingEmail: string | null
  adminUserId: string
  createdAt: string
  updatedAt: string
}

export type FleetMember = {
  id: string
  fleetAccountId: string
  userId: string
  fullName: string
  email: string
  role: FleetMemberRole
  status: FleetMemberStatus
  joinedAt: string
  thisMonthSessions: number
  thisMonthSpendPence: number
  thisMonthKwh: number
}

export type FleetSpendPolicy = {
  maxSpendPerSessionPence: number | null
  maxSpendPerMonthPence: number | null
  allowedListingTypes: string[]
  requiresApproval: boolean
}

export type FleetAnalytics = {
  thisMonth: { totalSpendPence: number; totalSessions: number; totalKwh: number }
  lastMonth: { totalSpendPence: number; totalSessions: number; totalKwh: number }
  topDriverId: string | null
  topDriverName: string | null
  avgCostPerSessionPence: number
}

export type FleetMembership = {
  fleetAccountId: string
  companyName: string
  role: FleetMemberRole
  spendPolicy: FleetSpendPolicy
  thisMonth: { sessionsCount: number; totalSpendPence: number; totalKwh: number }
  invoiceStatus: FleetInvoiceStatus
}
