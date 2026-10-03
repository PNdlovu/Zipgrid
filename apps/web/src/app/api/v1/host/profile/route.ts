/**
 * @file route.ts
 * @description GET   /api/v1/host/profile — the caller's host profile (404 if not a host)
 *              PATCH /api/v1/host/profile — become a host / update host details.
 *
 * Becoming a host adds the 'host' role and creates the host profile. Because
 * roles live in the access token, a fresh session is issued in the response
 * cookies so the new role applies immediately.
 *
 * @module apps/web/api/v1/host/profile
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getDb, transaction } from '@/lib/db'
import { ensureProfiles } from '@/domains/identity/AuthService'
import { createSession, revokeSession } from '@/lib/auth/sessions'
import { getRefreshTokenFromCookies, setAuthCookies } from '@/lib/cookies'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { clientIp } from '@/lib/rate-limit'

const ProfileSchema = z.object({
  hostType: z.enum(['residential', 'commercial']),
  displayName: z.string().trim().min(2).max(100),
  businessName: z.string().trim().max(150).optional(),
  vatNumber: z.string().trim().max(20).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const db = await getDb()
    const res = await db.execute(
      `SELECT hp.id, hp.host_type, hp.business_name, hp.vat_number, hp.stripe_connect_onboarded,
              hp.is_superhost, hp.total_listings, hp.average_rating, u.display_name
       FROM host_profiles hp JOIN users u ON u.id = hp.user_id
       WHERE hp.user_id = $1`,
      [userId],
    )
    const p = res.rows[0]
    if (!p) return apiError('NOT_A_HOST', 'You have not set up hosting yet.', 404)
    return apiResponse({
      id: p['id'],
      hostType: p['host_type'],
      displayName: p['display_name'],
      businessName: p['business_name'],
      vatNumber: p['vat_number'],
      payoutsReady: Boolean(p['stripe_connect_onboarded']),
      isSuperhost: Boolean(p['is_superhost']),
      totalListings: Number(p['total_listings'] ?? 0),
      averageRating: p['average_rating'] != null ? Number(p['average_rating']) : null,
    })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/host/profile')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, roles } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = ProfileSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }
    const d = parsed.data
    const becameHost = !roles.includes('host')

    await transaction(async (tx) => {
      if (becameHost) {
        await tx.execute(
          `UPDATE users SET roles = array_append(roles, 'host'::user_role), updated_at = NOW()
           WHERE id = $1 AND NOT ('host' = ANY(roles))`,
          [userId],
        )
      }
      await ensureProfiles(tx, userId, ['host'])
      await tx.execute(
        `UPDATE host_profiles
         SET host_type = $2::host_type,
             business_name = CASE WHEN $2 = 'commercial' THEN COALESCE($3, $4) ELSE business_name END,
             vat_number = COALESCE($5, vat_number),
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId, d.hostType, d.businessName ?? null, d.displayName, d.vatNumber ?? null],
      )
      await tx.execute(`UPDATE users SET display_name = $2, updated_at = NOW() WHERE id = $1`, [userId, d.displayName])
    })

    const response = apiResponse({ updated: true, roles: becameHost ? [...roles, 'host'] : roles })
    if (becameHost) {
      // New role → new access token. Replace the current session.
      const current = getRefreshTokenFromCookies(request.cookies)
      if (current) await revokeSession(current)
      const tokens = await createSession(userId, false, { ip: clientIp(request.headers), userAgent: request.headers.get('user-agent') })
      setAuthCookies(response, tokens)
    }
    return response
  } catch (err) {
    return errorResponse(err, 'PATCH /api/v1/host/profile')
  }
}
