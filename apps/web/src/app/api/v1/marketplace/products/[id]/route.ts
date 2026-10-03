/**
 * @file route.ts
 * @description GET /api/v1/marketplace/products/[id] — product detail.
 * @module apps/web/api/v1/marketplace/products/[id]
 */

import { type NextRequest } from 'next/server'
import { ProductService } from '@/domains/marketplace/ProductService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/marketplace/products/[id] — product detail. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const product = await ProductService.getById(id)
    return apiResponse(product)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
