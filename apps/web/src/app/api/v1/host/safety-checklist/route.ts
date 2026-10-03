/**
 * @file route.ts
 * @description POST /api/v1/host/safety-checklist — record a listing's safety
 * declarations and the host's acceptance of the safety/insurance terms, then
 * recompute its Safety Score. Required before a listing can be published.
 *
 * @module apps/web/api/v1/host/safety-checklist
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { assertListingOwner } from '@/domains/charging/AvailabilityService'
import { SafetyScoreService } from '@/domains/safety/SafetyScoreService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const ChecklistSchema = z.object({
  listingId: z.string().uuid(),
  hasRcdProtection: z.boolean(),
  isElectricianInstalled: z.boolean(),
  chargerInstallYear: z.number().int().min(2000).max(new Date().getFullYear()).nullable().optional(),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: 'You must accept the host safety and insurance terms.' }) }),
})

/** POST /api/v1/host/safety-checklist — record a listing's safety declarations and the host's acceptance of the safety/insurance terms, then recompute its Safety Score. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = ChecklistSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }
    const d = parsed.data
    await assertListingOwner(d.listingId, userId)

    const db = await getDb()
    await db.execute(
      `INSERT INTO safety_scores (listing_id, has_rcd_protection, is_electrician_installed, charger_install_year)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (listing_id) DO UPDATE
       SET has_rcd_protection = EXCLUDED.has_rcd_protection,
           is_electrician_installed = EXCLUDED.is_electrician_installed,
           charger_install_year = EXCLUDED.charger_install_year,
           updated_at = NOW()`,
      [d.listingId, d.hasRcdProtection, d.isElectricianInstalled, d.chargerInstallYear ?? null],
    )
    await db.execute(
      `UPDATE charger_listings SET insurance_tos_accepted = TRUE, insurance_tos_accepted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [d.listingId],
    )
    const score = await SafetyScoreService.calculate(d.listingId).catch((err: unknown) => {
      console.error('[host/safety-checklist] score calculation failed', err)
      return null
    })
    return apiResponse({ saved: true, safetyScore: score })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/host/safety-checklist')
  }
}
