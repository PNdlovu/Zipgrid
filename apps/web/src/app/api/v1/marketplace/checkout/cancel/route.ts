/**
 * @file route.ts
 * @description POST /api/v1/marketplace/checkout/cancel — release escrow.
 * Product orders: buyer or admin. Installer jobs: client or admin.
 * @module apps/web/api/v1/marketplace/checkout/cancel
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { CheckoutService } from '@/domains/marketplace/CheckoutService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const BodySchema = z.object({
  kind: z.enum(['product', 'installer_job']).default('product'),
  orderId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})

/** POST /api/v1/marketplace/checkout/cancel — release escrow. */
export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'orderId is required', 422)

    await CheckoutService.cancel({
      kind: parsed.data.kind,
      id: parsed.data.orderId,
      userId: user.userId,
      isAdmin: user.roles.includes('admin'),
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    })
    return apiResponse({ orderId: parsed.data.orderId, status: 'cancelled' })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/marketplace/checkout/cancel')
  }
}
