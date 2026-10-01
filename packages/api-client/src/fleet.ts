/**
 * @file fleet.ts
 * @description Typed API client for fleet account endpoints.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-29
 */

import { apiGet, apiPost, apiPatch, apiDelete } from './client'
import type { FleetMembership, FleetAccount, FleetMember, FleetSpendPolicy, FleetAnalytics } from '@zipgrid/types'

export type FleetAdminData = {
  id: string
  companyName: string
  drivers: FleetMember[]
  policy: FleetSpendPolicy
  analytics: FleetAnalytics
}

/** Get the current driver's fleet membership and spend policy. Returns null if not in a fleet. */
export async function getFleetMembership(): Promise<FleetMembership | null> {
  try {
    const res = await apiGet<{ fleet: FleetMembership }>('/api/v1/fleet/membership')
    return res.fleet
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('NOT_FOUND')) return null
    throw err
  }
}

/** Get full fleet admin data (drivers, policy, analytics). Fleet admin only. */
export async function getFleetAdmin(): Promise<FleetAdminData> {
  const res = await apiGet<{ fleet: FleetAdminData }>('/api/v1/fleet/admin')
  return res.fleet
}

/** Invite a driver to the fleet by email. */
export async function inviteFleetDriver(email: string): Promise<{ invited: boolean; email: string }> {
  return apiPost('/api/v1/fleet/invite', { email })
}

/** Update the fleet spend policy. */
export async function updateFleetPolicy(policy: Partial<FleetSpendPolicy>): Promise<{ updated: boolean }> {
  return apiPatch('/api/v1/fleet/policy', policy)
}

/** Remove a driver from the fleet. */
export async function removeFleetDriver(userId: string): Promise<{ removed: boolean }> {
  return apiDelete(`/api/v1/fleet/drivers/${userId}`)
}

/** Download the current month's fleet invoice as a CSV blob URL. */
export function getFleetInvoiceUrl(): string {
  return '/api/v1/fleet/invoice/current'
}
