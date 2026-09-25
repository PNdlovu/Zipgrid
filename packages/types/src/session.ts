/**
 * @file session.ts
 * @description Charging session and meter value type definitions.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { SessionStatus, OcppStatus } from './enums'

export type ChargingSession = {
  id: string
  bookingId: string
  chargePointId: string
  connectorId: number
  ocppTransactionId: number | null
  status: SessionStatus
  chargerStatus: OcppStatus

  startedAt: Date | null
  endedAt: Date | null

  // Energy & cost — all integers
  energyConsumedWh: number
  totalCostPence: number
  idleFeePence: number
  pricePerKwhPence: number

  // State of charge (if reported by charger/vehicle)
  socPercentStart: number | null
  socPercentEnd: number | null

  createdAt: Date
  updatedAt: Date
}

export type SessionMeterValue = {
  id: string
  sessionId: string
  timestamp: Date
  energyWh: number
  powerW: number | null
  voltageV: number | null
  currentA: number | null
  socPercent: number | null
  temperatureC: number | null
}
