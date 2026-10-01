/**
 * @file route.ts
 * @description GET /api/v1/host/analytics/export/[jobId]
 * Polls the status of an async export job.
 * Since jobs are synchronous in the current implementation,
 * this always returns 'ready'. Reserved for future async queue.
 *
 * @module apps/web/api/v1/host/analytics/export/[jobId]
 */

import { type NextRequest } from 'next/server'
import { apiError } from '@/lib/api/response'
import { NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  // jobId is validated but jobs are always synchronous in v1
  const { jobId } = await params
  if (!jobId) return apiError('VALIDATION_ERROR', 'jobId is required', 400)

  // Future: look up job from a jobs table/Redis
  return NextResponse.json({
    success: true,
    data: {
      job: {
        jobId,
        status: 'ready',
        downloadUrl: null,   // client should use the URL from the POST response
        rowCount: null,
        expiresAt: null,
      },
    },
  })
}
