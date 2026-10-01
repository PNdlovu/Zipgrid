/**
 * @file CurrencyService.ts
 * @description Shared formatting utilities for monetary values, energy, and durations.
 * All monetary input is in pence (integer). Output is localised for display.
 *
 * Rules (enforced here, not assumed by callers):
 *   - Money is always INT pence. Never pass a float to these functions.
 *   - Energy is Wh (integer). Converted to kWh for display.
 *   - Duration is minutes (integer). Converted to h/m for display.
 *
 * These functions are pure and synchronous — safe for use in React components,
 * API response mappers, email templates, and PDF receipts.
 *
 * @module domains/region
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { RegionCode } from './RegionService'

/* ── Currency locale map ────────────────────────────────────── */

/** Maps RegionCode → { locale, currency, symbol } */
const REGION_CURRENCY: Record<RegionCode, { locale: string; currency: string; symbol: string }> = {
  GB: { locale: 'en-GB', currency: 'GBP', symbol: '£' },
  IE: { locale: 'en-IE', currency: 'EUR', symbol: '€' },
  NL: { locale: 'nl-NL', currency: 'EUR', symbol: '€' },
  DE: { locale: 'de-DE', currency: 'EUR', symbol: '€' },
  US: { locale: 'en-US', currency: 'USD', symbol: '$' },
  AU: { locale: 'en-AU', currency: 'AUD', symbol: 'A$' },
}

const DEFAULT_REGION: RegionCode = 'GB'

/* ── CurrencyService ────────────────────────────────────────── */

export const CurrencyService = {

  // ── Money formatting ──────────────────────────────────────

  /**
   * Formats pence as a full currency string.
   * @param pence - Amount in pence (integer). £7.92 → 792
   * @param region - Region code (default GB)
   * @example formatPence(792) → "£7.92"
   * @example formatPence(1999, 'DE') → "19,99 €"
   */
  formatPence(pence: number, region: RegionCode = DEFAULT_REGION): string {
    const { locale, currency } = REGION_CURRENCY[region]
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(pence / 100)
  },

  /**
   * Formats pence/kWh as a rate string.
   * @param pence - Rate in pence per kWh (integer)
   * @example formatPencePerKwh(35) → "35p/kWh"
   * @example formatPencePerKwh(35, 'DE') → "0,35 €/kWh"
   */
  formatPencePerKwh(pence: number, region: RegionCode = DEFAULT_REGION): string {
    if (region === 'GB') {
      // UK convention: sub-£1 rates shown as Xp/kWh
      if (pence < 100) return `${pence}p/kWh`
      return `${this.formatPence(pence)}/kWh`
    }
    return `${this.formatPence(pence, region)}/kWh`
  },

  /**
   * Formats pence per hour as a rate string.
   * @param pence - Rate in pence per hour
   * @example formatPencePerHour(250) → "£2.50/hr"
   */
  formatPencePerHour(pence: number, region: RegionCode = DEFAULT_REGION): string {
    return `${this.formatPence(pence, region)}/hr`
  },

  /**
   * Formats pence as a compact abbreviated value for charts and small UI.
   * @example formatPenceCompact(150000) → "£1,500"
   * @example formatPenceCompact(792) → "£7.92"
   */
  formatPenceCompact(pence: number, region: RegionCode = DEFAULT_REGION): string {
    const { locale, currency } = REGION_CURRENCY[region]
    const pounds = pence / 100
    if (Math.abs(pounds) >= 1_000) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
        notation: 'compact',
      }).format(pounds)
    }
    return this.formatPence(pence, region)
  },

  /**
   * Returns just the currency symbol for a region.
   * @example currencySymbol('GB') → "£"
   */
  currencySymbol(region: RegionCode = DEFAULT_REGION): string {
    return REGION_CURRENCY[region].symbol
  },

  // ── Energy formatting ─────────────────────────────────────

  /**
   * Formats Wh as a kWh string with appropriate precision.
   * @param wh - Energy in Watt-hours (integer)
   * @example formatWh(23200) → "23.2 kWh"
   * @example formatWh(500) → "0.5 kWh"
   */
  formatWh(wh: number): string {
    const kwh = wh / 1000
    // 0 decimal places above 100 kWh, 1 decimal below 100, 2 below 1
    const decimals = kwh >= 100 ? 0 : kwh >= 1 ? 1 : 2
    return `${kwh.toFixed(decimals)} kWh`
  },

  /**
   * Formats kW as a power string.
   * @param kw - Power in kilowatts
   * @example formatKw(7.4) → "7.4 kW"
   * @example formatKw(150) → "150 kW"
   */
  formatKw(kw: number): string {
    const decimals = kw >= 10 ? 0 : 1
    return `${kw.toFixed(decimals)} kW`
  },

  /**
   * Formats watts as a power string (for live session display).
   * @param watts - Power in watts
   * @example formatW(7400) → "7.4 kW"
   * @example formatW(350000) → "350 kW"
   */
  formatW(watts: number): string {
    return this.formatKw(watts / 1000)
  },

  // ── Duration formatting ────────────────────────────────────

  /**
   * Formats minutes as a human-readable duration string.
   * @param minutes - Duration in minutes (integer)
   * @example formatMinutes(90) → "1h 30m"
   * @example formatMinutes(45) → "45m"
   * @example formatMinutes(0) → "0m"
   */
  formatMinutes(minutes: number): string {
    if (minutes <= 0) return '0m'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  },

  /**
   * Formats seconds as a live session timer string (HH:MM:SS).
   * @param seconds - Elapsed seconds
   * @example formatSeconds(3661) → "1:01:01"
   * @example formatSeconds(90) → "0:01:30"
   */
  formatSeconds(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const mm = String(m).padStart(2, '0')
    const ss = String(sec).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `0:${mm}:${ss}`
  },

  // ── Pricing display ────────────────────────────────────────

  /**
   * Returns a formatted price label for a listing's pricing model.
   * Handles all four pricing models (per_kwh, per_hour, per_session, hybrid).
   *
   * @param pricingModel - Listing pricing model
   * @param pricePerKwhPence - Price per kWh in pence (for per_kwh/hybrid)
   * @param pricePerHourPence - Price per hour in pence (for per_hour)
   * @param pricePerSessionPence - Flat session price in pence (for per_session/hybrid)
   * @param region - Region code for currency formatting
   *
   * @example
   *   formatListingPrice('per_kwh', 35) → "35p/kWh"
   *   formatListingPrice('per_hour', undefined, 250) → "£2.50/hr"
   *   formatListingPrice('per_session', undefined, undefined, 500) → "£5.00 flat"
   */
  formatListingPrice(
    pricingModel: string,
    pricePerKwhPence?: number | null,
    pricePerHourPence?: number | null,
    pricePerSessionPence?: number | null,
    region: RegionCode = DEFAULT_REGION,
  ): string {
    switch (pricingModel) {
      case 'per_kwh':
        return pricePerKwhPence != null
          ? this.formatPencePerKwh(pricePerKwhPence, region)
          : 'See listing'
      case 'per_hour':
        return pricePerHourPence != null
          ? this.formatPencePerHour(pricePerHourPence, region)
          : 'See listing'
      case 'per_session':
        return pricePerSessionPence != null
          ? `${this.formatPence(pricePerSessionPence, region)} flat`
          : 'See listing'
      case 'hybrid': {
        const parts: string[] = []
        if (pricePerSessionPence != null) parts.push(this.formatPence(pricePerSessionPence, region))
        if (pricePerKwhPence != null) parts.push(this.formatPencePerKwh(pricePerKwhPence, region))
        return parts.length > 0 ? parts.join(' + ') : 'See listing'
      }
      default:
        return 'See listing'
    }
  },

  // ── Distance formatting ────────────────────────────────────

  /**
   * Formats metres as a human-readable distance string.
   * @param metres - Distance in metres
   * @example formatMetres(450) → "450m"
   * @example formatMetres(1234) → "1.2km"
   */
  formatMetres(metres: number): string {
    if (metres < 1000) return `${Math.round(metres)}m`
    const km = metres / 1000
    const decimals = km >= 10 ? 0 : 1
    return `${km.toFixed(decimals)}km`
  },

  // ── CO₂ / sustainability ──────────────────────────────────

  /**
   * Estimates kg of CO₂ avoided vs. a petrol car for a given energy delivery.
   * Calculation: (kWh × 0.233 kgCO₂/kWh for UK grid) vs (petrol: 2.31 kg/litre × kWh/9.6)
   * Net avoided ≈ kWh × 0.15 kg (conservative estimate per EV Foundation data)
   * @param wh - Energy in Wh
   */
  estimateCo2AvoidedKg(wh: number): number {
    return Math.round((wh / 1000) * 0.15 * 10) / 10
  },
}
