/**
 * @file uk.ts
 * @description UK region configuration — currency GBP, VAT 20%, BS EN 61851, OZEV compliance.
 * @module domains/region/regions
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export const ukRegion = {
  code: 'GB',
  currency: 'GBP',
  currencySymbol: '£',
  vatRate: 0.2,
  defaultLocale: 'en-GB',
} as const
