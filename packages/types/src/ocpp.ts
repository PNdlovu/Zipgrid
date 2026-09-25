/**
 * @file ocpp.ts
 * @description OCPP 1.6J / 2.0.1 message type definitions.
 * Used by both apps/web (API routes) and apps/ocpp-service.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/** OCPP message type identifiers per protocol spec */
export enum OcppMessageType {
  Call = 2,
  CallResult = 3,
  CallError = 4,
}

export type OcppCall = [OcppMessageType.Call, string, string, Record<string, unknown>]
export type OcppCallResult = [OcppMessageType.CallResult, string, Record<string, unknown>]
export type OcppCallError = [OcppMessageType.CallError, string, string, string, Record<string, unknown>]
export type OcppMessage = OcppCall | OcppCallResult | OcppCallError

export type ChargePoint = {
  chargePointId: string
  vendor: string
  model: string
  serialNumber: string | null
  firmwareVersion: string | null
  connectedAt: Date
  lastHeartbeat: Date | null
}

export type OcppMeterValues = {
  chargePointId: string
  transactionId: number
  connectorId: number
  energyWh: number
  powerW: number | null
  voltageV: number | null
  currentA: number | null
  socPercent: number | null
  timestamp: Date
}
