/**
 * @file route.ts
 * @description GET /api/v1/wallet/history — paginated wallet ledger, newest first.
 * Query: page (default 1), pageSize (1–50, default 20; `limit` is accepted as an alias).
 * Also served at /api/v1/wallet/transactions (used by the mobile app).
 * @module apps/web/api/v1/wallet/history
 */

import { type NextRequest } from 'next/server'
import { WalletService } from '@/domains/payments/WalletService'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

/** GET /api/v1/wallet/history — paginated wallet ledger, newest first. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const size = parseInt(searchParams.get('pageSize') ?? searchParams.get('limit') ?? '20', 10) || 20
    const pageSize = Math.min(50, Math.max(1, size))

    const { transactions, total } = await WalletService.getHistory(userId, page, pageSize)
    return apiResponse(transactions, { page, pageSize, total })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/wallet/history')
  }
}
