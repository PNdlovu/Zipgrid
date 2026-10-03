/**
 * @file route.ts
 * @description GET /api/v1/property/residencies — properties the caller lives at
 *
 * @module apps/web/api/v1/property/residencies
 */

import { type NextRequest } from 'next/server'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'

/** GET /api/v1/property/residencies */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    return apiResponse({ residencies: await PropertyService.residencies(userId) })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/property/residencies')
  }
}
