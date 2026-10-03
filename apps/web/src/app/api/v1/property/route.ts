/**
 * @file route.ts
 * @description GET  /api/v1/property — the caller's properties (host)
 *              POST /api/v1/property — create a property
 *
 * @module apps/web/api/v1/property
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'
import { PropertyBodySchema, firstIssue } from './_schemas'

/** GET /api/v1/property — list the caller's properties. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    return apiResponse({ properties: await PropertyService.list(userId) })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/property')
  }
}

/** POST /api/v1/property — create a property. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const parsed = PropertyBodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', firstIssue(parsed.error), 422)
    return apiResponse(await PropertyService.create(userId, parsed.data), undefined, 201)
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/property')
  }
}
