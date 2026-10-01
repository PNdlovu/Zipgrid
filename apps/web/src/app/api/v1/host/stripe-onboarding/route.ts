/**
 * @file route.ts
 * @description POST /api/v1/host/stripe-onboarding
 * Creates or resumes a Stripe Connect Express onboarding session.
 *
 * Flow:
 *   1. Look up or create the host's Stripe Connect account
 *   2. Generate a Stripe AccountLink (onboarding URL, expires in ~5 min)
 *   3. Return the URL to the frontend for redirect
 *
 * The return_url and refresh_url bring the host back to /host/settings
 * after they complete (or abandon) the Stripe onboarding flow.
 *
 * @module apps/web/api/v1/host/stripe-onboarding
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { StripeService } from '@/domains/payments/StripeService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/**
 * GET /api/v1/host/stripe-onboarding
 * Returns the current Stripe Connect status for the host without creating anything.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `SELECT hp.stripe_connect_account_id, hp.stripe_connect_onboarded
       FROM host_profiles hp
       WHERE hp.user_id = $1 LIMIT 1`,
      [userId],
    )

    if (res.rows.length === 0) {
      return apiError('FORBIDDEN', 'Host profile not found', 403)
    }

    const row = res.rows[0] as {
      stripe_connect_account_id: string | null
      stripe_connect_onboarded: boolean
    }

    return apiResponse({
      stripeConnectAccountId: row.stripe_connect_account_id,
      stripeConnectOnboarded: Boolean(row.stripe_connect_onboarded),
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Fetch user email + name + existing Stripe Connect account
    const userRes = await db.execute(
      `SELECT u.email, u.full_name,
              hp.stripe_connect_account_id,
              hp.stripe_connect_onboarded
       FROM users u
       JOIN host_profiles hp ON hp.user_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    )
    if (userRes.rows.length === 0) {
      return apiError('FORBIDDEN', 'Host profile not found', 403)
    }

    const row = userRes.rows[0] as {
      email: string
      full_name: string
      stripe_connect_account_id: string | null
      stripe_connect_onboarded: boolean
    }

    // If already fully onboarded, return early with dashboard link
    if (row.stripe_connect_onboarded && row.stripe_connect_account_id) {
      return apiResponse({
        alreadyOnboarded: true,
        accountId: row.stripe_connect_account_id,
        dashboardUrl: 'https://dashboard.stripe.com',
      })
    }

    const appBaseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'
    const returnUrl  = `${appBaseUrl}/host/settings?stripe=success`
    const refreshUrl = `${appBaseUrl}/host/settings?stripe=refresh`

    let connectAccountId = row.stripe_connect_account_id

    if (!connectAccountId) {
      // Create a new Stripe Connect Express account
      const result = await StripeService.createConnectAccount(
        row.email,
        returnUrl,
        refreshUrl,
      )
      connectAccountId = result.accountId

      // Persist the account ID immediately so retries don't create duplicates
      await db.execute(
        `UPDATE host_profiles
         SET stripe_connect_account_id = $2, updated_at = NOW()
         WHERE user_id = $1`,
        [userId, connectAccountId],
      )

      return apiResponse({
        alreadyOnboarded: false,
        accountId: connectAccountId,
        onboardingUrl: result.onboardingUrl,
      })
    }

    // Account exists but not fully onboarded — generate a fresh AccountLink
    // (links expire after ~5 minutes so we always generate a new one)
    const { onboardingUrl } = await StripeService.createConnectAccount(
      row.email,
      returnUrl,
      refreshUrl,
    )

    return apiResponse({
      alreadyOnboarded: false,
      accountId: connectAccountId,
      onboardingUrl,
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/host/stripe-onboarding]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
