/**
 * @file route.ts
 * @description GET /api/v1/marketplace/installers/[id] — installer profile.
 * @module apps/web/api/v1/marketplace/installers/[id]
 */

import { type NextRequest } from 'next/server'
import { InstallerService } from '@/domains/marketplace/InstallerService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return apiResponse(await InstallerService.getById(id))
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
