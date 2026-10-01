/**
 * @file route.ts
 * @description GET /api/v1/wallet/history — paginated wallet transaction history.
 * Used by the wallet page "Load more" functionality.
 *
 * @module apps/web/api/v1/wallet/history
 */

import { type NextRequest } from 'next/server'
import { WalletService } from '@/domains/payments/WalletService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const { searchParams } = request.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)))

  try {
    const { transactions, total } = await WalletService.getHistory(userId, page, pageSize)
    return apiResponse(transactions, { page, pageSize, total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
