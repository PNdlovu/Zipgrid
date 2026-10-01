/**
 * @file route.ts
 * @description GET /api/v1/wallet — current balance + recent transactions.
 * @module apps/web/api/v1/wallet
 */

import { type NextRequest } from 'next/server'
import { WalletService } from '@/domains/payments/WalletService'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const [balance, { transactions, total }] = await Promise.all([
      WalletService.getBalance(userId),
      WalletService.getHistory(userId, 1, 10),
    ])
    return apiResponse({ balance, recentTransactions: transactions, totalTransactions: total })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}
