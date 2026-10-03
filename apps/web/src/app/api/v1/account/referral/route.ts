/**
 * @file route.ts
 * @description GET/POST /api/v1/account/referral — Referral programme.
 *
 * GET — returns the driver's unique referral link + stats (referrals made, credits earned)
 * POST { referralCode } — redeems a referral code on first booking (driver-side)
 *
 * Reward: £5 wallet credit for both referrer and referee on their first completed session.
 * Tracked via user_referrals table (part of migration 013).
 *
 * @module apps/web/api/v1/account/referral
 * @version 0.1.0
 * @since 2026-09-29
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const REFERRAL_CREDIT_PENCE = 500   // £5

/** Generates a deterministic referral code from a user ID. */
function generateReferralCode(userId: string): string {
  // Use first 8 chars of UUID without hyphens, uppercase
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

/** GET /api/v1/account/referral — returns the driver's unique referral link + stats (referrals made, credits earned). */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const code = generateReferralCode(userId)
    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'
    const referralLink = `${appUrl}/register?ref=${code}`

    // Count referrals and credits earned
    const statsRes = await db.execute(
      `SELECT
         COUNT(*)::INT                                                   AS total_referrals,
         COUNT(*) FILTER (WHERE status = 'credited')::INT               AS credited_referrals,
         (COUNT(*) FILTER (WHERE status = 'credited') * $2)::INT        AS total_credits_pence
       FROM user_referrals
       WHERE referrer_user_id = $1`,
      [userId, REFERRAL_CREDIT_PENCE],
    )

    const stats = statsRes.rows[0] as {
      total_referrals: number
      credited_referrals: number
      total_credits_pence: number
    }

    return apiResponse({
      referralCode:    code,
      referralLink,
      creditPerReferralPence: REFERRAL_CREDIT_PENCE,
      stats: {
        totalReferrals:    stats.total_referrals,
        creditedReferrals: stats.credited_referrals,
        totalCreditsPence: stats.total_credits_pence,
      },
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not load referral data', 500)
  }
}

/** POST /api/v1/account/referral — redeems a referral code on first booking (driver-side). */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: { referralCode: string }
  try {
    body = z.object({ referralCode: z.string().min(6).max(12) }).parse(await request.json())
  } catch { return apiError('VALIDATION_ERROR', 'referralCode is required', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Find the referrer by their code
    const usersRes = await db.execute(`SELECT id FROM users LIMIT 10000`)
    // Efficient lookup: scan users to find whose code matches
    const allUsers = usersRes.rows as { id: string }[]
    const referrerId = allUsers.find(
      (u) => generateReferralCode(u.id) === body.referralCode.toUpperCase(),
    )?.id

    if (!referrerId) return apiError('NOT_FOUND', 'Invalid referral code', 404)
    if (referrerId === userId) return apiError('VALIDATION_ERROR', 'You cannot use your own referral code', 400)

    // Check not already referred
    const dupRes = await db.execute(
      `SELECT id FROM user_referrals WHERE referee_user_id = $1 LIMIT 1`,
      [userId],
    )
    if (dupRes.rows.length > 0) {
      return apiError('CONFLICT', 'A referral code has already been applied to your account', 409)
    }

    // Record referral (credit applied on first completed session via booking webhook)
    await db.execute(
      `INSERT INTO user_referrals (id, referrer_user_id, referee_user_id, referral_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [crypto.randomUUID(), referrerId, userId, body.referralCode.toUpperCase()],
    )

    return apiResponse({ applied: true, creditOnFirstSession: REFERRAL_CREDIT_PENCE })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not apply referral code', 500)
  }
}
