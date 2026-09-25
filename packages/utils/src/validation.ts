/**
 * @file validation.ts
 * @description Common validation helpers used across web and mobile.
 * @module @zipgrid/utils
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/** Validates a UK postcode format */
export function isValidUkPostcode(postcode: string): boolean {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(cleaned)
}

/** Formats a UK postcode with the standard space before the inward code */
export function formatUkPostcode(postcode: string): string {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  if (cleaned.length < 5) return cleaned
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`
}

/** Validates an email address */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Validates a UK mobile phone number */
export function isValidUkPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  return /^(\+44|0)7\d{9}$/.test(cleaned)
}
