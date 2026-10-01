/**
 * @file route.ts
 * @description POST /api/v1/marketplace/installers/[id]/book — book an installer job.
 * @module apps/web/api/v1/marketplace/installers/[id]/book
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { InstallerService } from '@/domains/marketplace/InstallerService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

const BookSchema = z.object({
  serviceCategory: z.enum([
    'new_installation','repair','maintenance','upgrade','survey','ev_ready_survey','other',
  ]),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  address: z.record(z.unknown()),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  quotedPricePence: z.number().int().positive().optional(),
  listingId: z.string().uuid().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { id: installerId } = await params

  let body: unknown
  try { body = await request.json() } catch { return apiError('INVALID_JSON', 'Invalid JSON', 400) }

  const parsed = BookSchema.safeParse(body)
  if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid', 422)

  try {
    const job = await InstallerService.bookJob({
      installerProfileId: installerId,
      clientUserId: userId,
      serviceCategory: parsed.data.serviceCategory,
      title: parsed.data.title,
      address: parsed.data.address,
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.scheduledDate !== undefined ? { scheduledDate: parsed.data.scheduledDate } : {}),
      ...(parsed.data.scheduledTime !== undefined ? { scheduledTime: parsed.data.scheduledTime } : {}),
      ...(parsed.data.quotedPricePence !== undefined ? { quotedPricePence: parsed.data.quotedPricePence } : {}),
      ...(parsed.data.listingId !== undefined ? { listingId: parsed.data.listingId } : {}),
    })
    return apiResponse(job, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/marketplace/installers/:id/book]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
