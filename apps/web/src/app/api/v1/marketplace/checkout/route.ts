/**
 * @file route.ts
 * @description POST /api/v1/marketplace/checkout — escrow payment for a product
 * order or an installer job (see CheckoutService for the full lifecycle).
 * @module apps/web/api/v1/marketplace/checkout
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { CheckoutService } from '@/domains/marketplace/CheckoutService'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

const CheckoutSchema = z.object({
  installerJobId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(10).default(1),
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/, 'paymentMethodId is required'),
  shippingAddress: z.record(z.unknown()).optional(),
}).refine((d) => (d.installerJobId != null) !== (d.productId != null), {
  message: 'Provide exactly one of installerJobId or productId',
})

/** POST /api/v1/marketplace/checkout — escrow payment for a product order or an installer job (see CheckoutService for the full lifecycle). */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    let body: unknown
    try { body = await request.json() } catch {
      return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
    }
    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
    }
    const d = parsed.data
    const result = await CheckoutService.checkout(
      userId,
      d.productId
        ? { kind: 'product', productId: d.productId, quantity: d.quantity, ...(d.shippingAddress ? { shippingAddress: d.shippingAddress } : {}) }
        : { kind: 'installer_job', installerJobId: d.installerJobId! },
      d.paymentMethodId,
    )
    return apiResponse({ ...result, orderId: result.id }, undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/marketplace/checkout')
  }
}
