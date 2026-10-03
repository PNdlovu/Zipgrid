/**
 * @file route.ts
 * @description GET /api/v1/marketplace/installers — search installers.
 * @module apps/web/api/v1/marketplace/installers
 */

import { type NextRequest } from 'next/server'
import { InstallerService } from '@/domains/marketplace/InstallerService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/** GET /api/v1/marketplace/installers — search installers. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  const lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : undefined
  const lng = searchParams.get('lng') ? Number(searchParams.get('lng')) : undefined
  const postcode = searchParams.get('postcode') ?? undefined
  const serviceCategory = searchParams.get('service') ?? undefined

  try {
    const result = await InstallerService.searchNearby({
      ...(lat !== undefined ? { lat } : {}),
      ...(lng !== undefined ? { lng } : {}),
      ...(postcode !== undefined ? { postcode } : {}),
      ...(serviceCategory !== undefined ? { serviceCategory } : {}),
      ozevOnly: searchParams.get('ozev') === 'true',
      page,
      pageSize,
    })
    return apiResponse(result.installers, { page, pageSize, total: result.total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[GET /api/v1/marketplace/installers]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
