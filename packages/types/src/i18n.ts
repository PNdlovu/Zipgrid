/**
 * @file i18n.ts
 * @description Internationalisation types and locale configuration.
 * @module @zipgrid/types
 */

export type SupportedLocale = 'en-GB' | 'en-IE' | 'nl-NL' | 'de-DE' | 'fr-BE'

export type SupportedCurrency = 'GBP' | 'EUR'

export type LocaleConfig = {
  locale: SupportedLocale
  currency: SupportedCurrency
  currencySymbol: string
  countryCode: string
  countryName: string
  vatRate: number             // e.g. 0.20 for UK, 0.21 for NL
  vatLabel: string            // e.g. 'VAT' or 'BTW'
  dateFormat: string          // e.g. 'DD/MM/YYYY'
  distanceUnit: 'miles' | 'km'
  energyUnit: 'kWh'           // universal
  phonePrefix: string         // e.g. '+44'
}

export const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {
  'en-GB': {
    locale:         'en-GB',
    currency:       'GBP',
    currencySymbol: '£',
    countryCode:    'GB',
    countryName:    'United Kingdom',
    vatRate:        0.20,
    vatLabel:       'VAT',
    dateFormat:     'DD/MM/YYYY',
    distanceUnit:   'miles',
    energyUnit:     'kWh',
    phonePrefix:    '+44',
  },
  'en-IE': {
    locale:         'en-IE',
    currency:       'EUR',
    currencySymbol: '€',
    countryCode:    'IE',
    countryName:    'Ireland',
    vatRate:        0.23,
    vatLabel:       'VAT',
    dateFormat:     'DD/MM/YYYY',
    distanceUnit:   'km',
    energyUnit:     'kWh',
    phonePrefix:    '+353',
  },
  'nl-NL': {
    locale:         'nl-NL',
    currency:       'EUR',
    currencySymbol: '€',
    countryCode:    'NL',
    countryName:    'Netherlands',
    vatRate:        0.21,
    vatLabel:       'BTW',
    dateFormat:     'DD-MM-YYYY',
    distanceUnit:   'km',
    energyUnit:     'kWh',
    phonePrefix:    '+31',
  },
  'de-DE': {
    locale:         'de-DE',
    currency:       'EUR',
    currencySymbol: '€',
    countryCode:    'DE',
    countryName:    'Germany',
    vatRate:        0.19,
    vatLabel:       'MwSt',
    dateFormat:     'DD.MM.YYYY',
    distanceUnit:   'km',
    energyUnit:     'kWh',
    phonePrefix:    '+49',
  },
  'fr-BE': {
    locale:         'fr-BE',
    currency:       'EUR',
    currencySymbol: '€',
    countryCode:    'BE',
    countryName:    'Belgium',
    vatRate:        0.21,
    vatLabel:       'TVA',
    dateFormat:     'DD/MM/YYYY',
    distanceUnit:   'km',
    energyUnit:     'kWh',
    phonePrefix:    '+32',
  },
}

/**
 * Format a monetary amount in the correct locale.
 * @param amountSmallest - Amount in smallest currency unit (pence / cents)
 * @param locale - Target locale
 */
export function formatMoney(amountSmallest: number, locale: SupportedLocale): string {
  const config = LOCALE_CONFIGS[locale]
  const amount = amountSmallest / 100
  return new Intl.NumberFormat(locale, {
    style:    'currency',
    currency: config.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a distance in the correct unit for the locale.
 */
export function formatDistance(km: number, locale: SupportedLocale): string {
  const config = LOCALE_CONFIGS[locale]
  if (config.distanceUnit === 'miles') {
    return `${(km * 0.621371).toFixed(1)} mi`
  }
  return `${km.toFixed(1)} km`
}
