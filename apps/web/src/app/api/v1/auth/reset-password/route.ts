/**
 * @file route.ts
 * @description POST /api/v1/auth/reset-password — request a password reset email.
 * Always returns 200 regardless of whether email exists (anti-enumeration).
 *
 * @module apps/web/api/v1/auth/reset-password
 * @access Public
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { AuthService } from '@/domains/identity/AuthService'
import { apiResponse, apiError } from '@/lib/api/response'

const ResetRequestSchema = z.object({ email: z.string().email() })

/**
 * POST /api/v1/auth/reset-password
 * Sends reset email if account exists. Always returns success.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = ResetRequestSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', 'Enter a valid email address', 422)
  }

  // Fire and forget — never reveal whether email exists
  AuthService.requestPasswordReset(parsed.data.email).catch((err) => {
    console.error('[POST /api/v1/auth/reset-password]', err)
  })

  return apiResponse({ sent: true })
}
