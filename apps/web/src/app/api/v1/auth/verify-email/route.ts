/**
 * @file route.ts
 * @description POST /api/v1/auth/verify-email — verify 6-digit OTP sent to email.
 *
 * @module apps/web/api/v1/auth/verify-email
 * @access Public (requires unverified account)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
})

/**
 * POST /api/v1/auth/verify-email
 * Verifies the 6-digit OTP code for email verification.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = VerifyEmailSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    await AuthService.verifyEmail(parsed.data.email, parsed.data.code)
    return apiResponse({ verified: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/auth/verify-email]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
