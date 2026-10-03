/**
 * @file _schemas.ts
 * @description Request schemas shared by the /api/v1/property routes.
 * @module apps/web/api/v1/property
 */

import { z } from 'zod'

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null))

export const PropertyBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: optionalText(100),
  city: z.string().trim().min(2).max(100),
  postcode: z.string().trim().regex(/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/, 'Enter a valid UK postcode'),
  totalUnits: z.number().int().positive().max(10_000).nullish().transform((v) => v ?? null),
  revenueModel: z.enum(['property', 'resident', 'split']),
  splitPropertyPct: z.number().int().min(0).max(100).default(100),
  accessMode: z.enum(['residents_only', 'public', 'residents_priority']),
  residentDiscountPct: z.number().int().min(0).max(100).default(0),
})

export const BayCreateSchema = z.object({
  listingId: z.string().uuid(),
  bayLabel: optionalText(40),
})

export const BayPatchSchema = z.object({
  bayLabel: optionalText(40).optional(),
  assignedResidentId: z.string().uuid().nullable().optional(),
})

export const InviteSchema = z.object({
  email: z.string().trim().email().max(254),
  unitNumber: optionalText(30),
})

export const ResidentPatchSchema = z.object({ unitNumber: optionalText(30) })

export const TokenSchema = z.object({ token: z.string().min(20).max(100) })

/** First validation message, for a 422 response. */
export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0]
  return i ? `${i.path.join('.') || 'body'}: ${i.message}` : 'Invalid request'
}
