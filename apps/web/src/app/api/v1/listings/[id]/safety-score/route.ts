/**
 * @file route.ts
 * @description GET /api/v1/listings/[id]/safety-score
 * Returns the most recent calculated safety score for a listing.
 * Used by the listing detail page and the host charger health dashboard.
 *
 * Public endpoint — scores are visible to drivers to build trust.
 * Detailed component breakdown is only shown to the listing owner.
 *
 * @module apps/web/api/v1/listings/[id]/safety-score
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { SafetyScoreService } from '@/domains/safety/SafetyScoreService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { id: listingId } = await params
  const userId = request.headers.get('x-user-id') // optional — may be null for public access

  try {
    // Get or calculate the safety score
    const scoreData = await SafetyScoreService.get(listingId)

    // For public callers, return summary only (score + band + label)
    // For the listing owner, return full component breakdown
    const isOwner = userId
      ? await checkIsOwner(listingId, userId)
      : false

    if (!isOwner) {
      return apiResponse({
        listingId,
        score:       scoreData.overallScore,
        band:        scoreData.band,
        label:       scoreData.bandLabel,
        calculatedAt: scoreData.lastCalculatedAt,
      })
    }

    // Owner gets full breakdown
    return apiResponse({
      listingId,
      score:        scoreData.overallScore,
      band:         scoreData.band,
      label:        scoreData.bandLabel,
      calculatedAt: scoreData.lastCalculatedAt,
      components:   scoreData.components,
      recommendations: buildRecommendations(scoreData),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/* ── Helpers ────────────────────────────────────────────────── */

async function checkIsOwner(listingId: string, userId: string): Promise<boolean> {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()
  const res = await db.execute(
    `SELECT 1 FROM charger_listings cl
     JOIN host_profiles hp ON hp.id = cl.host_profile_id
     WHERE cl.id = $1 AND hp.user_id = $2 LIMIT 1`,
    [listingId, userId],
  )
  return res.rows.length > 0
}

function buildRecommendations(
  score: Awaited<ReturnType<typeof SafetyScoreService.get>>,
): string[] {
  const tips: string[] = []
  const c = score.components

  if (c.rcdProtection.score < 80) {
    tips.push('Ensure your charger has RCD protection installed by a qualified electrician.')
  }
  if (c.electricianInstalled.score < 80) {
    tips.push('Have your charger installation certified by an OZEV-approved electrician.')
  }
  if (c.ocppFaultRate.score < 70) {
    tips.push('Your charger has reported recurring faults. Consider a maintenance check.')
  }
  if (c.chargerAge.score < 60) {
    tips.push('Your charger is reaching the end of its typical service life. Consider an upgrade.')
  }
  if (c.platformInspection.score === 0) {
    tips.push('Book a Zipgrid platform inspection to unlock your full safety score.')
  }

  return tips
}
