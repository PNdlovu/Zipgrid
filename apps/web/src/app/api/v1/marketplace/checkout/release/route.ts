/**
 * @file route.ts
 * @description POST /api/v1/marketplace/checkout/release — capture escrow.
 * Product orders: vendor or admin. Installer jobs: assigned installer or admin.
 * @module apps/web/api/v1/marketplace/checkout/release
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { CheckoutService } from '@/domains/marketplace/CheckoutService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const BodySchema = z.object({
  kind: z.enum(['product', 'installer_job']).default('product'),
  orderId: z.string().uuid(),
})

/** POST /api/v1/marketplace/checkout/release — capture escrow. */
export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'orderId is required', 422)

    await CheckoutService.release({
      kind: parsed.data.kind,
      id: parsed.data.orderId,
      userId: user.userId,
      isAdmin: user.roles.includes('admin'),
    })
    return apiResponse({ orderId: parsed.data.orderId, status: parsed.data.kind === 'product' ? 'confirmed' : 'completed' })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/marketplace/checkout/release')
  }
}
