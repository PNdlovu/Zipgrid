/**
 * @file route.ts
 * @description POST /api/v1/auth/reset-password/confirm — set a new password
 * from a reset token. Tokens are single use; all sessions are signed out.
 * @module apps/web/api/v1/auth/reset-password/confirm
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse } from '@/lib/api/context'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const ConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required').max(2000),
  password: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

/** POST /api/v1/auth/reset-password/confirm — set a new password from a reset token. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(`reset-confirm:ip:${clientIp(request.headers)}`, 10, 15 * 60)
  if (!limit.allowed) return apiError('RATE_LIMITED', 'Too many attempts — please wait a few minutes.', 429)

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
    return errorResponse(err, 'POST /api/v1/auth/reset-password/confirm')
  }
}
