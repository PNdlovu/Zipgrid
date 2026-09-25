/**
 * @file route.ts
 * @description POST /api/v1/auth/reset-password/confirm — set new password from reset token.
 *
 * @module apps/web/api/v1/auth/reset-password/confirm
 * @access Public (token from reset email)
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const ConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

/**
 * POST /api/v1/auth/reset-password/confirm
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = ConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  try {
    await AuthService.confirmPasswordReset(parsed.data.token, parsed.data.password)
    return apiResponse({ updated: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
