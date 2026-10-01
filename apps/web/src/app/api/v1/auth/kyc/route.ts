/**
 * @file route.ts
 * @description KYC API routes.
 *
 * POST /api/v1/auth/kyc — Initiate Stripe Identity verification.
 *   Returns a client_secret for the Stripe Identity frontend SDK.
 *
 * GET /api/v1/auth/kyc — Get current KYC status for the authenticated user.
 *
 * @module apps/web/api/v1/auth/kyc
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { KycService } = await import('@/domains/identity/KycService')
    const result = await KycService.initiateVerification(userId)
    return apiResponse(result, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    }
    console.error('[auth/kyc POST]', err)
    return apiError('INTERNAL_ERROR', 'Could not initiate KYC verification', 500)
  }
}

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { KycService } = await import('@/domains/identity/KycService')
    const state = await KycService.getStatus(userId)
    return apiResponse({ kyc: state })
  } catch (err) {
    if (err instanceof AppError) {
      return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    }
    console.error('[auth/kyc GET]', err)
    return apiError('INTERNAL_ERROR', 'Could not fetch KYC status', 500)
  }
}
