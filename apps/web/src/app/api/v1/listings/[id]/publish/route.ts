/**
 * @file route.ts
 * @description POST /api/v1/listings/[id]/publish — set listing status to 'active'.
 *
 * @module apps/web/api/v1/listings/[id]/publish
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { ListingService } from '@/domains/charging/ListingService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

type Params = { params: Promise<{ id: string }> }

/** POST /api/v1/listings/[id]/publish */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id } = await params
  try {
    await ListingService.publish(id, userId)
    return apiResponse({ published: true })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
