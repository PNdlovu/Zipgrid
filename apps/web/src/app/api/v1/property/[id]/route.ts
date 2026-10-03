/**
 * @file route.ts
 * @description GET    /api/v1/property/:id — property detail (bays, residents)
 *              PATCH  /api/v1/property/:id — update settings
 *              DELETE /api/v1/property/:id — archive
 *
 * @module apps/web/api/v1/property/[id]
 */

import { type NextRequest } from 'next/server'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { PropertyService } from '@/domains/property/PropertyService'
import { PropertyBodySchema, firstIssue } from '../_schemas'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/v1/property/:id — property detail for its host. */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    return apiResponse(await PropertyService.get(userId, id))
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/property/:id')
  }
}

/** PATCH /api/v1/property/:id — replace the property's settings. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    const parsed = PropertyBodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', firstIssue(parsed.error), 422)
    await PropertyService.update(userId, id, parsed.data)
    return apiResponse({ updated: true })
  } catch (err) {
    return errorResponse(err, 'PATCH /api/v1/property/:id')
  }
}

/** DELETE /api/v1/property/:id — archive the property. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { userId } = requireUser(request)
    const { id } = await params
    await PropertyService.archive(userId, id)
    return apiResponse({ archived: true })
  } catch (err) {
    return errorResponse(err, 'DELETE /api/v1/property/:id')
  }
}
