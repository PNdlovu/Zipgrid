/**
 * @file route.ts
 * @description GET/POST /api/v1/carbon/credits — Carbon credit marketplace.
 * Drivers earn verified carbon credits for every kWh charged vs equivalent
 * petrol journey. Credits can be sold on the platform or donated to charities.
 *
 * GET  — driver's carbon credit balance and transaction history
 * POST — list/sell credits, or donate to a registered charity
 *
 * Carbon accounting:
 *   Grid intensity (UK 2026): 233 gCO₂/kWh
 *   Petrol equivalent:        170 gCO₂/km × 5.63 km/kWh = 957 gCO₂/kWh
 *   Net avoided per kWh:      957 - 233 = 724 gCO₂ = 0.000724 tCO₂
 *   1 credit = 1 kgCO₂ avoided = ~1.38 kWh charged
 *   Market rate: ~£5–15 per tCO₂ (voluntary market, 2026)
 *   Zipgrid credit value: £0.005–0.015 per credit (1 credit = 1 kg = 0.001 tCO₂)
 *
 * @module apps/web/api/v1/carbon/credits
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

// gCO₂ avoided per kWh (petrol equivalent minus UK grid intensity)
const CO2_AVOIDED_G_PER_KWH = 724
// Market rate for carbon credits in pence (£0.01 per credit = £10/tCO₂)
const CREDIT_VALUE_PENCE = 1

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sell'),   creditCount: z.number().int().positive() }),
  z.object({ action: z.literal('donate'), creditCount: z.number().int().positive(), charityId: z.string().uuid() }),
  z.object({ action: z.literal('retire'), creditCount: z.number().int().positive(), reason: z.string().optional() }),
])

/** GET /api/v1/carbon/credits */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Calculate total credits earned from session history
    const statsRes = await db.execute(
      `SELECT
         COALESCE(SUM(cs.energy_consumed_wh) / 1000.0, 0)::NUMERIC(14,3) AS total_kwh,
         COALESCE(SUM(cs.energy_consumed_wh) / 1000.0 * $2 / 1000.0, 0)::NUMERIC(10,2) AS total_credits_earned,
         COUNT(cs.id)::INT AS total_sessions
       FROM charging_sessions cs
       JOIN bookings b ON b.id = cs.booking_id
       JOIN driver_profiles dp ON dp.id = b.driver_profile_id
       WHERE dp.user_id = $1 AND cs.status = 'completed'`,
      [userId, CO2_AVOIDED_G_PER_KWH],
    )

    const stats = statsRes.rows[0] as {
      total_kwh: number
      total_credits_earned: number
      total_sessions: number
    }

    // Get credit balance from carbon_credits table
    const balanceRes = await db.execute(
      `SELECT
         COALESCE(SUM(credits) FILTER (WHERE action IN ('earn')), 0)::INT AS earned,
         COALESCE(SUM(credits) FILTER (WHERE action IN ('sell', 'donate', 'retire')), 0)::INT AS used,
         COALESCE(SUM(credits) FILTER (WHERE action IN ('earn')), 0)::INT -
         COALESCE(SUM(credits) FILTER (WHERE action IN ('sell', 'donate', 'retire')), 0)::INT AS balance
       FROM carbon_credit_ledger
       WHERE user_id = $1`,
      [userId],
    )

    const balance = balanceRes.rows[0] as { earned: number; used: number; balance: number }

    // Recent transactions
    const txRes = await db.execute(
      `SELECT action, credits, value_pence, description, created_at
       FROM carbon_credit_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [userId],
    )

    const totalCo2Kg    = Number(stats.total_kwh) * CO2_AVOIDED_G_PER_KWH / 1000
    const totalCo2Tonnes = totalCo2Kg / 1000
    const balanceCredits = Math.max(0, balance.balance ?? 0)
    const balanceValuePence = balanceCredits * CREDIT_VALUE_PENCE

    // Available charities
    const charitiesRes = await db.execute(
      `SELECT id, name, description, logo_url, website FROM carbon_charities WHERE is_active = TRUE LIMIT 10`,
      [],
    )

    return apiResponse({
      balance: {
        credits:      balanceCredits,
        valuePence:   balanceValuePence,
        earned:       balance.earned ?? 0,
        used:         balance.used ?? 0,
      },
      lifetime: {
        totalKwh:       Number(stats.total_kwh),
        totalCo2Kg:     Math.round(totalCo2Kg * 10) / 10,
        totalCo2Tonnes: Math.round(totalCo2Tonnes * 1000) / 1000,
        totalSessions:  stats.total_sessions,
        creditsEarned:  Math.round(totalCo2Kg),
      },
      creditValuePence: CREDIT_VALUE_PENCE,
      transactions:     txRes.rows,
      charities:        charitiesRes.rows,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[carbon/credits GET]', err)
    return apiError('INTERNAL_ERROR', 'Could not load carbon credits', 500)
  }
}

/** POST /api/v1/carbon/credits — sell, donate, or retire credits */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof ActionSchema>
  try { body = ActionSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid action', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Check balance
    const balanceRes = await db.execute(
      `SELECT
         COALESCE(SUM(credits) FILTER (WHERE action = 'earn'), 0)::INT -
         COALESCE(SUM(credits) FILTER (WHERE action IN ('sell','donate','retire')), 0)::INT
         AS balance
       FROM carbon_credit_ledger WHERE user_id = $1`,
      [userId],
    )
    const currentBalance = Number((balanceRes.rows[0] as { balance: number }).balance ?? 0)

    if (body.creditCount > currentBalance) {
      return apiError('INSUFFICIENT_CREDITS', `You only have ${currentBalance} credits available`, 400)
    }

    let description = ''
    let valuePence  = 0

    if (body.action === 'sell') {
      valuePence  = body.creditCount * CREDIT_VALUE_PENCE
      description = `Sold ${body.creditCount} credits for £${(valuePence / 100).toFixed(2)}`
      // Credit wallet
      await fetch(`${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/api/v1/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ type: 'promotional', amountPence: valuePence, description }),
      }).catch(() => { /* non-fatal */ })
    } else if (body.action === 'donate') {
      const charityId = (body as { action: 'donate'; creditCount: number; charityId: string }).charityId
      description = `Donated ${body.creditCount} credits to charity`
      // Log donation
      await db.execute(
        `INSERT INTO carbon_donations (id, user_id, charity_id, credits, created_at)
         VALUES ($1,$2,$3,$4,NOW())`,
        [crypto.randomUUID(), userId, charityId, body.creditCount],
      )
    } else {
      description = `Retired ${body.creditCount} credits`
    }

    // Record in ledger
    await db.execute(
      `INSERT INTO carbon_credit_ledger (id, user_id, action, credits, value_pence, description, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [crypto.randomUUID(), userId, body.action, body.creditCount, valuePence, description],
    )

    return apiResponse({
      success:     true,
      action:      body.action,
      credits:     body.creditCount,
      valuePence,
      newBalance:  currentBalance - body.creditCount,
      description,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[carbon/credits POST]', err)
    return apiError('INTERNAL_ERROR', 'Carbon credit action failed', 500)
  }
}
