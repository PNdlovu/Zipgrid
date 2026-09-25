/**
 * @file currency.ts
 * @description Currency formatting utilities — pence to display string.
 * All monetary values in the platform are stored as pence (integer).
 * These utils format them for display only — never for calculation.
 * @module @zipgrid/utils
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/**
 * Formats pence (integer) to a display string.
 * @param pence - Amount in pence as integer
 * @param locale - BCP 47 locale tag (default: 'en-GB')
 * @param currency - ISO 4217 currency code (default: 'GBP')
 * @returns Formatted string e.g. "£1.40"
 * @example formatPence(140) // "£1.40"
 * @example formatPence(1099, 'en-US', 'USD') // "$10.99"
 */
export function formatPence(pence: number, locale = 'en-GB', currency = 'GBP'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100)
}

/**
 * Formats pence as a compact amount (e.g. "£1.40/kWh")
 */
export function formatPencePerUnit(pence: number, unit: string, locale = 'en-GB', currency = 'GBP'): string {
  return `${formatPence(pence, locale, currency)}/${unit}`
}

/**
 * Converts pence to pounds (for display only — never store as float).
 */
export function penceToPounds(pence: number): number {
  return pence / 100
}

/**
 * Converts pounds to pence for storage (rounds to nearest penny).
 */
export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100)
}
