/**
 * @file route.ts
 * @description GET /api/v1/marketplace/cart — view cart.
 *              POST /api/v1/marketplace/cart — add item.
 *              DELETE /api/v1/marketplace/cart?productId=xxx — remove item.
 * @module apps/web/api/v1/marketplace/cart
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { ProductService } from '@/domains/marketplace/ProductService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  try {
    const items = await ProductService.getCart(userId)
    const subtotalPence = items.reduce((sum, i) => sum + i.product.pricePence * i.quantity, 0)
    return apiResponse({ items, subtotalPence })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

const AddSchema = z.object({ productId: z.string().uuid(), quantity: z.number().int().positive().default(1) })

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }
  const parsed = AddSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  try {
    await ProductService.addToCart(userId, parsed.data.productId, parsed.data.quantity)
    return apiResponse({ added: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)
  const productId = request.nextUrl.searchParams.get('productId')
  if (!productId) return apiError('VALIDATION_ERROR', 'productId query param required', 422)
  try {
    await ProductService.removeFromCart(userId, productId)
    return apiResponse({ removed: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
