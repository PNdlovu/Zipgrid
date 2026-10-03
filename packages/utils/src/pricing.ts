/**
 * @file pricing.ts
 * @description Charging session pricing — the single implementation shared by
 * the web platform (booking estimates, live cost) and the OCPP service (final
 * cost at StopTransaction). All amounts are integer pence.
 *
 * Energy is always the delta between the meter reading at StartTransaction and
 * the latest reading — never the charger's absolute (lifetime) register.
 *
 * @module @zipgrid/utils
 */

export type PricingModel = 'per_kwh' | 'per_hour' | 'per_session' | 'hybrid'

/** Tariff snapshot taken from the booking when the session starts. */
export type Tariff = {
  pricingModel: PricingModel
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  /** Charged per minute the vehicle stays plugged in after charging stops. */
  idleFeePerMinPence: number
}

export type SessionCostInput = {
  tariff: Tariff
  /** Energy delivered in this session (meter delta), Wh. */
  energyWh: number
  /** When energy started flowing. */
  startedAt: Date | null
  /** Session end, or "now" for a running estimate. */
  endedAt: Date
  /** Minutes plugged in but not charging, beyond the grace period. */
  idleMinutes?: number
}

export type SessionCost = {
  energyPence: number
  timePence: number
  sessionFeePence: number
  idleFeePence: number
  totalPence: number
}

/** Platform commission on charging revenue. */
export const PLATFORM_FEE_RATE = 0.15

/** Minutes of idle time that are free before idle fees apply. */
export const IDLE_GRACE_MINUTES = 10

/** Returns the energy delivered between two meter readings, never negative. */
export function meterDeltaWh(meterStartWh: number | null | undefined, meterNowWh: number): number {
  const start = meterStartWh ?? meterNowWh
  return Math.max(0, Math.round(meterNowWh - start))
}

/** Computes the cost of a session from its tariff snapshot and usage. */
export function calculateSessionCost(input: SessionCostInput): SessionCost {
  const { tariff } = input
  const kwh = Math.max(0, input.energyWh) / 1000
  const minutes = input.startedAt
    ? Math.max(0, (input.endedAt.getTime() - input.startedAt.getTime()) / 60_000)
    : 0

  let energyPence = 0
  let timePence = 0
  let sessionFeePence = 0

  switch (tariff.pricingModel) {
    case 'per_kwh':
      energyPence = Math.round(kwh * (tariff.pricePerKwhPence ?? 0))
      break
    case 'per_hour':
      timePence = Math.round((minutes / 60) * (tariff.pricePerHourPence ?? 0))
      break
    case 'per_session':
      sessionFeePence = tariff.pricePerSessionPence ?? 0
      break
    case 'hybrid':
      sessionFeePence = tariff.pricePerSessionPence ?? 0
      energyPence = Math.round(kwh * (tariff.pricePerKwhPence ?? 0))
      break
  }

  const idleMinutes = Math.max(0, (input.idleMinutes ?? 0) - IDLE_GRACE_MINUTES)
  const idleFeePence = Math.round(idleMinutes * Math.max(0, tariff.idleFeePerMinPence))

  return {
    energyPence,
    timePence,
    sessionFeePence,
    idleFeePence,
    totalPence: energyPence + timePence + sessionFeePence + idleFeePence,
  }
}

/** Splits a captured amount into platform fee and host earnings. */
export function splitRevenue(totalPence: number, feeRate = PLATFORM_FEE_RATE): {
  platformFeePence: number
  hostEarningsPence: number
} {
  const platformFeePence = Math.round(totalPence * feeRate)
  return { platformFeePence, hostEarningsPence: totalPence - platformFeePence }
}

/**
 * Estimates the authorisation hold for a booking window.
 * Assumes the charger runs at full power for the whole window, capped by the
 * vehicle battery when known, with a minimum hold of 50p (Stripe minimum).
 */
export function estimateBookingHold(input: {
  tariff: Tariff
  maxPowerKw: number
  batteryKwh: number | null
  start: Date
  end: Date
}): number {
  const hours = Math.max(0, (input.end.getTime() - input.start.getTime()) / 3_600_000)
  const kwh = Math.min(input.maxPowerKw * hours, input.batteryKwh ?? Number.POSITIVE_INFINITY)
  const cost = calculateSessionCost({
    tariff: input.tariff,
    energyWh: kwh * 1000,
    startedAt: input.start,
    endedAt: input.end,
  })
  return Math.max(50, cost.totalPence)
}
