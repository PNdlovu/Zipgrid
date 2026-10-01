/**
 * @file TariffEngine.ts
 * @description Tariff engine — computes optimal charging windows and costs
 * for time-of-use electricity tariffs (Octopus Agile, Octopus Go, Economy 7, flat).
 *
 * All monetary values in pence (integer).
 * All timestamps in UTC ISO 8601.
 *
 * Tariff sources:
 *   Octopus Agile  — half-hourly variable (fetched from Octopus API)
 *   Octopus Go     — cheap overnight window (23:30–05:30)
 *   Economy 7      — cheap overnight window (typically 00:30–07:30)
 *   Flat           — constant price (user-defined per kWh)
 *
 * @module domains/region
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/* ── Types ─────────────────────────────────────────────────── */

export type TariffType =
  | 'octopus_agile'
  | 'octopus_go'
  | 'economy_7'
  | 'edf_goelectric'
  | 'eon_drive'
  | 'flat'

export type HalfHourSlot = {
  /** ISO 8601 UTC start */
  from: string
  /** ISO 8601 UTC end */
  to: string
  /** Price in pence per kWh */
  pricePerKwhPence: number
  /** True if this is a cheap/off-peak slot */
  isOffPeak: boolean
}

export type ChargingWindow = {
  from: string
  to: string
  durationMinutes: number
  estimatedCostPence: number
  estimatedKwh: number
  avgPricePerKwhPence: number
  isOptimal: boolean
}

export type TariffSchedule = {
  tariffType: TariffType
  slots: HalfHourSlot[]
  cheapestSlot: HalfHourSlot | null
  peakSlot: HalfHourSlot | null
  avgPricePerKwhPence: number
}

export type OptimiseInput = {
  tariffType: TariffType
  targetKwh: number
  chargerMaxKw: number
  vehicleMaxKw?: number
  /** Must finish by (ISO 8601 UTC) */
  mustFinishBy: string
  /** Allow charging from (ISO 8601 UTC). Defaults to now. */
  canStartFrom?: string
  /** Octopus API key (required for agile tariff only) */
  octopusApiKey?: string
  /** Flat tariff price in pence/kWh (required for flat tariff) */
  flatPricePerKwhPence?: number
}

/* ── Constants ──────────────────────────────────────────────── */

/** Octopus Go cheap rate window (UTC hours) */
const OCTOPUS_GO_CHEAP_START_UTC = 23.5   // 23:30 UTC
const OCTOPUS_GO_CHEAP_END_UTC   = 5.5    // 05:30 UTC
const OCTOPUS_GO_CHEAP_PENCE     = 9       // 9p/kWh approx (varies by plan)
const OCTOPUS_GO_PEAK_PENCE      = 34      // 34p/kWh approx

/** Economy 7 cheap rate window (UTC — varies by DNO, this is a typical range) */
const ECONOMY7_CHEAP_START_UTC   = 0.5    // 00:30 UTC
const ECONOMY7_CHEAP_END_UTC     = 7.5    // 07:30 UTC
const ECONOMY7_CHEAP_PENCE       = 14     // 14p/kWh approx
const ECONOMY7_PEAK_PENCE        = 38     // 38p/kWh approx

/**
 * EDF GoElectric — overnight EV-specific cheap rate
 * Cheap window: 00:00–07:00 UTC
 * Source: EDF GoElectric tariff (as of 2026)
 */
const EDF_CHEAP_START_UTC        = 0.0    // 00:00 UTC
const EDF_CHEAP_END_UTC          = 7.0    // 07:00 UTC
const EDF_CHEAP_PENCE            = 11     // ~11p/kWh cheap rate
const EDF_PEAK_PENCE             = 36     // ~36p/kWh peak rate

/**
 * EOn Drive — overnight EV rate
 * Cheap window: 00:00–07:00 UTC
 * Source: EOn Drive tariff (as of 2026)
 */
const EON_CHEAP_START_UTC        = 0.0    // 00:00 UTC
const EON_CHEAP_END_UTC          = 7.0    // 07:00 UTC
const EON_CHEAP_PENCE            = 12     // ~12p/kWh cheap rate
const EON_PEAK_PENCE             = 35     // ~35p/kWh peak rate

/* ── Tariff Engine ──────────────────────────────────────────── */

export const TariffEngine = {

  /**
   * Builds a 24-hour schedule of half-hour slots for the given tariff.
   * For Agile, fetches real prices from the Octopus API.
   * For others, uses fixed windows.
   */
  async buildSchedule(
    tariffType: TariffType,
    opts: { octopusApiKey?: string; flatPricePerKwhPence?: number; date?: Date } = {},
  ): Promise<TariffSchedule> {
    const date = opts.date ?? new Date()

    switch (tariffType) {
      case 'octopus_agile':
        return this._buildAgileSchedule(date, opts.octopusApiKey)
      case 'octopus_go':
        return this._buildTimeOfUseSchedule(
          tariffType, date,
          OCTOPUS_GO_CHEAP_START_UTC, OCTOPUS_GO_CHEAP_END_UTC,
          OCTOPUS_GO_CHEAP_PENCE, OCTOPUS_GO_PEAK_PENCE,
        )
      case 'economy_7':
        return this._buildTimeOfUseSchedule(
          tariffType, date,
          ECONOMY7_CHEAP_START_UTC, ECONOMY7_CHEAP_END_UTC,
          ECONOMY7_CHEAP_PENCE, ECONOMY7_PEAK_PENCE,
        )
      case 'edf_goelectric':
        return this._buildTimeOfUseSchedule(
          tariffType, date,
          EDF_CHEAP_START_UTC, EDF_CHEAP_END_UTC,
          EDF_CHEAP_PENCE, EDF_PEAK_PENCE,
        )
      case 'eon_drive':
        return this._buildTimeOfUseSchedule(
          tariffType, date,
          EON_CHEAP_START_UTC, EON_CHEAP_END_UTC,
          EON_CHEAP_PENCE, EON_PEAK_PENCE,
        )
      case 'flat':
      default: {
        const price = opts.flatPricePerKwhPence ?? 28 // 28p default
        return this._buildFlatSchedule(date, price)
      }
    }
  },

  /**
   * Finds the cheapest charging window that delivers targetKwh
   * before mustFinishBy, respecting charger power limits.
   */
  async optimise(input: OptimiseInput): Promise<ChargingWindow | null> {
    const scheduleOpts: Parameters<typeof this.buildSchedule>[1] = {}
    if (input.octopusApiKey !== undefined) scheduleOpts.octopusApiKey = input.octopusApiKey
    if (input.flatPricePerKwhPence !== undefined) scheduleOpts.flatPricePerKwhPence = input.flatPricePerKwhPence
    const schedule = await this.buildSchedule(input.tariffType, scheduleOpts)

    const chargeKw = Math.min(input.chargerMaxKw, input.vehicleMaxKw ?? input.chargerMaxKw)
    const hoursNeeded = input.targetKwh / chargeKw
    const slotsNeeded = Math.ceil(hoursNeeded * 2) // 30min slots

    const mustFinishBy = new Date(input.mustFinishBy).getTime()
    const canStartFrom = input.canStartFrom
      ? new Date(input.canStartFrom).getTime()
      : Date.now()

    // Filter to eligible slots
    const eligible = schedule.slots.filter((slot) => {
      const start = new Date(slot.from).getTime()
      const end   = new Date(slot.to).getTime()
      return start >= canStartFrom && end <= mustFinishBy
    })

    if (eligible.length < slotsNeeded) return null

    // Sliding window: find cheapest consecutive block of `slotsNeeded` slots
    let bestCost = Infinity
    let bestStart = 0

    for (let i = 0; i <= eligible.length - slotsNeeded; i++) {
      const window = eligible.slice(i, i + slotsNeeded)
      const cost = window.reduce(
        (sum, slot) => sum + (slot.pricePerKwhPence * chargeKw * 0.5),
        0,
      )
      if (cost < bestCost) {
        bestCost = cost
        bestStart = i
      }
    }

    const bestSlots = eligible.slice(bestStart, bestStart + slotsNeeded)
    const lastSlot = bestSlots[bestSlots.length - 1]
    if (!bestSlots.length || !bestSlots[0] || !lastSlot) return null

    const avgPrice = Math.round(
      bestSlots.reduce((s, sl) => s + sl.pricePerKwhPence, 0) / bestSlots.length,
    )
    const estimatedKwh = chargeKw * (slotsNeeded / 2)
    const estimatedCost = Math.round(avgPrice * estimatedKwh)

    const isOptimal = avgPrice <= schedule.avgPricePerKwhPence

    return {
      from: bestSlots[0].from,
      to: lastSlot.to,
      durationMinutes: slotsNeeded * 30,
      estimatedCostPence: estimatedCost,
      estimatedKwh: Math.round(estimatedKwh * 10) / 10,
      avgPricePerKwhPence: avgPrice,
      isOptimal,
    }
  },

  /**
   * Calculates the cost of a completed session given its energy and tariff.
   */
  calculateSessionCost(
    energyKwh: number,
    tariffType: TariffType,
    pricePerKwhPence: number,
    startedAt: Date,
  ): number {
    // For Agile: we'd look up the actual slot prices — simplified to pricePerKwhPence here
    // For all others: straightforward multiplication
    const isOffPeak = this._isOffPeakAt(tariffType, startedAt)
    const effectivePrice = isOffPeak
      ? this._cheapPriceForTariff(tariffType) ?? pricePerKwhPence
      : pricePerKwhPence
    return Math.round(energyKwh * effectivePrice)
  },

  /**
   * Returns true if the given time falls in the off-peak window for the tariff.
   */
  _isOffPeakAt(tariffType: TariffType, at: Date): boolean {
    const utcHour = at.getUTCHours() + at.getUTCMinutes() / 60
    switch (tariffType) {
      case 'octopus_go':
        return utcHour >= OCTOPUS_GO_CHEAP_START_UTC || utcHour < OCTOPUS_GO_CHEAP_END_UTC
      case 'economy_7':
        return utcHour >= ECONOMY7_CHEAP_START_UTC && utcHour < ECONOMY7_CHEAP_END_UTC
      case 'edf_goelectric':
        return utcHour >= EDF_CHEAP_START_UTC && utcHour < EDF_CHEAP_END_UTC
      case 'eon_drive':
        return utcHour >= EON_CHEAP_START_UTC && utcHour < EON_CHEAP_END_UTC
      default:
        return false
    }
  },

  _cheapPriceForTariff(tariffType: TariffType): number | null {
    switch (tariffType) {
      case 'octopus_go': return OCTOPUS_GO_CHEAP_PENCE
      case 'economy_7':  return ECONOMY7_CHEAP_PENCE
      case 'edf_goelectric': return EDF_CHEAP_PENCE
      case 'eon_drive':  return EON_CHEAP_PENCE
      default: return null
    }
  },

  // ── Schedule builders ─────────────────────────────────────

  async _buildAgileSchedule(date: Date, apiKey?: string): Promise<TariffSchedule> {
    const slots: HalfHourSlot[] = []

    if (apiKey) {
      try {
        const dateStr = date.toISOString().slice(0, 10)
        const res = await fetch(
          `https://api.octopus.energy/v1/products/AGILE-FLEX-22-11-25/electricity-tariffs/E-1R-AGILE-FLEX-22-11-25-A/standard-unit-rates/?period_from=${dateStr}T00:00:00Z&period_to=${dateStr}T23:30:00Z`,
          {
            headers: { 'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
            signal: AbortSignal.timeout(5_000),
          },
        )
        if (res.ok) {
          const data = (await res.json()) as { results: Array<{ value_inc_vat: number; valid_from: string; valid_to: string }> }
          for (const result of data.results) {
            slots.push({
              from: result.valid_from,
              to: result.valid_to,
              pricePerKwhPence: Math.round(result.value_inc_vat),
              isOffPeak: result.value_inc_vat < 15, // sub-15p is cheap for Agile
            })
          }
        }
      } catch {
        // Fall through to estimated schedule
      }
    }

    if (slots.length === 0) {
      // Estimated Agile-like schedule based on typical daily patterns
      return this._buildEstimatedAgileSchedule(date)
    }

    return this._finaliseSchedule('octopus_agile', slots)
  },

  _buildEstimatedAgileSchedule(date: Date): TariffSchedule {
    // Approximate typical Agile price curve (pence/kWh by hour UTC)
    const hourlyEstimates = [
      13, 12, 11, 10, 9, 8, 9, 14,   // 00–07
      22, 28, 32, 34, 33, 30, 28, 26, // 08–15
      28, 32, 38, 42, 40, 36, 28, 18, // 16–23
    ]
    const slots: HalfHourSlot[] = []
    const base = new Date(date)
    base.setUTCHours(0, 0, 0, 0)

    for (let h = 0; h < 24; h++) {
      for (let half = 0; half < 2; half++) {
        const from = new Date(base.getTime() + (h * 60 + half * 30) * 60_000)
        const to   = new Date(from.getTime() + 30 * 60_000)
        const price = (hourlyEstimates[h] ?? 28) + (half === 1 ? 0 : 0)
        slots.push({
          from: from.toISOString(),
          to: to.toISOString(),
          pricePerKwhPence: price,
          isOffPeak: price < 15,
        })
      }
    }
    return this._finaliseSchedule('octopus_agile', slots)
  },

  _buildTimeOfUseSchedule(
    tariffType: TariffType,
    date: Date,
    cheapStartUtcHour: number,
    cheapEndUtcHour: number,
    cheapPence: number,
    peakPence: number,
  ): TariffSchedule {
    const slots: HalfHourSlot[] = []
    const base = new Date(date)
    base.setUTCHours(0, 0, 0, 0)

    for (let h = 0; h < 24; h++) {
      for (let half = 0; half < 2; half++) {
        const utcHour = h + half * 0.5
        const isCheap = cheapStartUtcHour > cheapEndUtcHour
          // Wraps midnight (e.g. 23:30 → 05:30)
          ? utcHour >= cheapStartUtcHour || utcHour < cheapEndUtcHour
          : utcHour >= cheapStartUtcHour && utcHour < cheapEndUtcHour

        const from = new Date(base.getTime() + (h * 60 + half * 30) * 60_000)
        const to   = new Date(from.getTime() + 30 * 60_000)
        slots.push({
          from: from.toISOString(),
          to: to.toISOString(),
          pricePerKwhPence: isCheap ? cheapPence : peakPence,
          isOffPeak: isCheap,
        })
      }
    }
    return this._finaliseSchedule(tariffType, slots)
  },

  _buildFlatSchedule(date: Date, pricePerKwhPence: number): TariffSchedule {
    const slots: HalfHourSlot[] = []
    const base = new Date(date)
    base.setUTCHours(0, 0, 0, 0)

    for (let i = 0; i < 48; i++) {
      const from = new Date(base.getTime() + i * 30 * 60_000)
      const to   = new Date(from.getTime() + 30 * 60_000)
      slots.push({
        from: from.toISOString(),
        to: to.toISOString(),
        pricePerKwhPence,
        isOffPeak: false,
      })
    }
    return this._finaliseSchedule('flat', slots)
  },

  _finaliseSchedule(tariffType: TariffType, slots: HalfHourSlot[]): TariffSchedule {
    const sorted = [...slots].sort((a, b) => a.pricePerKwhPence - b.pricePerKwhPence)
    const avg = slots.length > 0
      ? Math.round(slots.reduce((s, sl) => s + sl.pricePerKwhPence, 0) / slots.length)
      : 0
    return {
      tariffType,
      slots,
      cheapestSlot: sorted[0] ?? null,
      peakSlot: sorted[sorted.length - 1] ?? null,
      avgPricePerKwhPence: avg,
    }
  },
}
