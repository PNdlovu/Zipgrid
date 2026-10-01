/**
 * @file RegionService.ts
 * @description Region service — detects user region, routes to correct data residency,
 * and provides region-aware business rules (currency, VAT, locale, regulatory context).
 *
 * Launch: UK only.
 * Phase 3: Ireland (IE), Netherlands (NL), Germany (DE).
 * Phase 4: United States (US), Australia (AU).
 *
 * @module domains/region
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/* ── Types ─────────────────────────────────────────────────── */

export type RegionCode = 'GB' | 'IE' | 'NL' | 'DE' | 'US' | 'AU'

export type RegionConfig = {
  code: RegionCode
  name: string
  currency: string         // ISO 4217
  currencySymbol: string
  locale: string           // BCP 47
  vatRate: number          // 0–1 (e.g. 0.20 for UK 20%)
  vatLabel: string         // e.g. 'VAT' | 'BTW' | 'MwSt'
  timezone: string         // IANA timezone
  /** Minimum price per kWh in currency units (pence/cents) */
  minPricePerKwh: number
  maxPricePerKwh: number
  /** Regulatory body name */
  regulator: string
  /** Whether smart charging / Agile tariff integration is available */
  smartTariffAvailable: boolean
  /** Platform launch status */
  status: 'live' | 'coming_soon' | 'planned'
}

/* ── Region definitions ─────────────────────────────────────── */

const REGIONS: Record<RegionCode, RegionConfig> = {
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    currencySymbol: '£',
    locale: 'en-GB',
    vatRate: 0.20,
    vatLabel: 'VAT',
    timezone: 'Europe/London',
    minPricePerKwh: 5,      // 5p/kWh minimum
    maxPricePerKwh: 200,    // 200p = £2/kWh maximum
    regulator: 'OZEV / OfGEM',
    smartTariffAvailable: true,
    status: 'live',
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'en-IE',
    vatRate: 0.23,
    vatLabel: 'VAT',
    timezone: 'Europe/Dublin',
    minPricePerKwh: 5,
    maxPricePerKwh: 250,
    regulator: 'CRU',
    smartTariffAvailable: false,
    status: 'coming_soon',
  },
  NL: {
    code: 'NL',
    name: 'Netherlands',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'nl-NL',
    vatRate: 0.21,
    vatLabel: 'BTW',
    timezone: 'Europe/Amsterdam',
    minPricePerKwh: 5,
    maxPricePerKwh: 300,
    regulator: 'ACM',
    smartTariffAvailable: false,
    status: 'coming_soon',
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'de-DE',
    vatRate: 0.19,
    vatLabel: 'MwSt',
    timezone: 'Europe/Berlin',
    minPricePerKwh: 5,
    maxPricePerKwh: 300,
    regulator: 'BNetzA',
    smartTariffAvailable: false,
    status: 'planned',
  },
  US: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    locale: 'en-US',
    vatRate: 0,             // Sales tax varies by state — handled separately
    vatLabel: 'Tax',
    timezone: 'America/New_York',
    minPricePerKwh: 5,      // 5¢/kWh
    maxPricePerKwh: 200,    // $2/kWh
    regulator: 'NEVI / DOE',
    smartTariffAvailable: false,
    status: 'planned',
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    currency: 'AUD',
    currencySymbol: 'A$',
    locale: 'en-AU',
    vatRate: 0.10,
    vatLabel: 'GST',
    timezone: 'Australia/Sydney',
    minPricePerKwh: 5,
    maxPricePerKwh: 200,
    regulator: 'ARENA / AER',
    smartTariffAvailable: false,
    status: 'planned',
  },
}

/* ── Service ────────────────────────────────────────────────── */

export const RegionService = {

  /**
   * Returns the configuration for a region.
   * Defaults to GB (launch region).
   */
  getConfig(code: RegionCode = 'GB'): RegionConfig {
    return REGIONS[code] ?? REGIONS['GB']
  },

  /**
   * Returns all region configs (for region selection UI).
   */
  getAllRegions(): RegionConfig[] {
    return Object.values(REGIONS)
  },

  /**
   * Returns live and coming-soon regions (for public display).
   */
  getAvailableRegions(): RegionConfig[] {
    return Object.values(REGIONS).filter((r) => r.status !== 'planned')
  },

  /**
   * Detects the likely region from an HTTP Accept-Language header.
   * Falls back to GB.
   */
  detectFromAcceptLanguage(acceptLanguage: string | null): RegionCode {
    if (!acceptLanguage) return 'GB'
    const primary = acceptLanguage.split(',')[0]?.split('-')[1]?.toUpperCase()
    if (primary && primary in REGIONS) return primary as RegionCode
    return 'GB'
  },

  /**
   * Detects region from a UK/EU postcode prefix.
   * Very coarse — just distinguishes UK from nothing.
   */
  detectFromPostcode(postcode: string): RegionCode {
    // UK postcodes start with 1–2 letters
    if (/^[A-Z]{1,2}\d/i.test(postcode)) return 'GB'
    return 'GB'
  },

  /**
   * Formats a pence/cent amount as a currency string for the given region.
   * @param smallestUnit - Amount in smallest currency unit (pence/cents)
   * @param code - Region code
   */
  formatCurrency(smallestUnit: number, code: RegionCode = 'GB'): string {
    const config = this.getConfig(code)
    const amount = smallestUnit / 100
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: 2,
    }).format(amount)
  },

  /**
   * Calculates VAT-inclusive price from a VAT-exclusive price.
   */
  addVat(priceExVat: number, code: RegionCode = 'GB'): number {
    const config = this.getConfig(code)
    return Math.round(priceExVat * (1 + config.vatRate))
  },

  /**
   * Extracts VAT component from a VAT-inclusive price.
   */
  extractVat(priceIncVat: number, code: RegionCode = 'GB'): number {
    const config = this.getConfig(code)
    return Math.round(priceIncVat * (config.vatRate / (1 + config.vatRate)))
  },
}
