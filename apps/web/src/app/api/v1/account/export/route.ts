/**
 * @file route.ts
 * @description POST /api/v1/account/export — GDPR Art. 20 data portability.
 * Generates a full JSON export of all personal data for the authenticated user.
 * Returns the data inline (for small accounts) or triggers an async job.
 *
 * For production at scale, this should queue an async job and email the user
 * a download link within 24 hours. For now it runs synchronously (suitable
 * for early-stage volumes).
 *
 * Rate limited: 1 export per user per 24 hours.
 *
 * @module apps/web/api/v1/account/export
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'
import { GdprService } from '@/domains/compliance/GdprService'
import { AppError } from '@/lib/errors/AppError'
import { apiError } from '@/lib/api/response'

/** Simple in-process rate limit: one export per userId per 24h */
const _exportRateMap = new Map<string, number>()

function checkExportRateLimit(userId: string): boolean {
  const last = _exportRateMap.get(userId) ?? 0
  const now  = Date.now()
  if (now - last < 24 * 60 * 60 * 1000) return false  // within 24h
  _exportRateMap.set(userId, now)
  return true
}

/** POST /api/v1/account/export — GDPR Art. 20 data portability: JSON export of all of the caller's personal data. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  if (!checkExportRateLimit(userId)) {
    return apiError(
      'RATE_LIMITED',
      'You can only request one data export per 24 hours.',
      429,
    )
  }

  try {
    const exportData = await GdprService.exportData(userId)

    // Return as a downloadable JSON file
    const json = JSON.stringify(exportData, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="zipgrid-data-export-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    console.error('[POST /api/v1/account/export]', err)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
