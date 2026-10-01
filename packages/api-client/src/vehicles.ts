/**
 * @file vehicles.ts
 * @description Typed API client for driver vehicle endpoints.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-29
 */

import { apiGet, apiPost, apiPatch, apiDelete } from './client'

export type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  color: string | null
  licensePlate: string | null
  plugTypes: string[]
  batteryCapacityKwh: number | null
  isPrimary: boolean
  isActive: boolean
  createdAt: string
}

export type CreateVehicleInput = {
  make: string
  model: string
  year: number
  color?: string
  licensePlate?: string
  plugTypes: string[]
  batteryCapacityKwh?: number
}

/** List all vehicles in the authenticated driver's garage. */
export async function listVehicles(): Promise<Vehicle[]> {
  const res = await apiGet<{ vehicles: Vehicle[] }>('/api/v1/vehicles')
  return res.vehicles
}

/** Add a new vehicle to the garage. */
export async function addVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  const res = await apiPost<{ vehicle: Vehicle }>('/api/v1/vehicles', input)
  return res.vehicle
}

/** Update a vehicle (partial update). */
export async function updateVehicle(id: string, input: Partial<CreateVehicleInput> & { isPrimary?: boolean }): Promise<Vehicle> {
  const res = await apiPatch<{ vehicle: Vehicle }>(`/api/v1/vehicles/${id}`, input)
  return res.vehicle
}

/** Delete a vehicle from the garage. */
export async function deleteVehicle(id: string): Promise<{ deleted: boolean }> {
  return apiDelete(`/api/v1/vehicles/${id}`)
}

/** Set a vehicle as the primary (default) for bookings. */
export async function setPrimaryVehicle(id: string): Promise<Vehicle> {
  return updateVehicle(id, { isPrimary: true })
}
