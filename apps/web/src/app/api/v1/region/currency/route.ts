/**
 * @file route.ts
 * @description GET /api/v1/region/currency — Multi-currency support.
 * Returns current EUR/GBP exchange rate and user locale config.
 * Used for EU pilot (Ireland, Netherlands, Germany, Belgium).
 *
 * @module apps/web/api/v1/region/currency
 */

import { type NextRequest } from 'next/server'
import { apiResponse } from '@/lib/api/response'
import { LOCALE_CONFIGS, type SupportedLocale } from '@zipgrid/types'

/** GET /api/v1/region/currency */
export async function GET(request: NextRequest) {
  const localeParam = (request.nextUrl.searchParams.get('locale') ?? 'en-GB') as SupportedLocale
  const config = LOCALE_CONFIGS[localeParam] ?? LOCALE_CONFIGS['en-GB']

  // EUR/GBP rate — in production fetch from ECB or Open Exchange Rates
  // Using a fixed approximation; update via cron in production
  const rates: Record<string, number> = {
    GBP: 1.0,
    EUR: 1.18,   // approximate GBP → EUR
  }

  return apiResponse({
    locale:          config.locale,
    currency:        config.currency,
    currencySymbol:  config.currencySymbol,
    exchangeRate:    rates[config.currency] ?? 1.0,
    baseCurrency:    'GBP',
    vatRate:         config.vatRate,
    vatLabel:        config.vatLabel,
    distanceUnit:    config.distanceUnit,
    phonePrefix:     config.phonePrefix,
    supportedLocales: Object.keys(LOCALE_CONFIGS),
  })
}
