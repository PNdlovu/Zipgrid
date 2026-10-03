/**
 * @file route.ts
 * @description GET /api/v1/marketplace/products — search products.
 * @module apps/web/api/v1/marketplace/products
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { ProductService } from '@/domains/marketplace/ProductService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/marketplace/products — search products. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  try {
    const categorySlug = searchParams.get('category') ?? undefined
    const query = searchParams.get('q') ?? undefined
    const plugType = searchParams.get('plugType') ?? undefined
    const maxPricePence = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined

    const result = await ProductService.search({
      ...(categorySlug !== undefined ? { categorySlug } : {}),
      ...(query !== undefined ? { query } : {}),
      ...(plugType !== undefined ? { plugType } : {}),
      ...(maxPricePence !== undefined ? { maxPricePence } : {}),
      featuredOnly: searchParams.get('featured') === 'true',
      page,
      pageSize,
    })
    return apiResponse(result.products, { page, pageSize, total: result.total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/marketplace/products]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
