/**
 * @file route.ts
 * @description POST /api/v1/auth/kyc/initiate — start identity verification.
 * Creates a Stripe Identity VerificationSession and returns the client_secret
 * for the frontend to pass to the Stripe Identity SDK.
 *
 * @module apps/web/api/v1/auth/kyc/initiate
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { KycService } from '@/domains/identity/KycService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** POST /api/v1/auth/kyc/initiate */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const result = await KycService.initiateVerification(userId)
    return apiResponse(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/** GET /api/v1/auth/kyc/initiate — returns current KYC status */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const status = await KycService.getStatus(userId)
    return apiResponse(status)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
