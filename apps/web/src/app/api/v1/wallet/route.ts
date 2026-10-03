/**
 * @file route.ts
 * @description GET /api/v1/wallet — current balance (total, reserved, available),
 * any outstanding session balance owed, and the 10 most recent ledger entries.
 * @module apps/web/api/v1/wallet
 */

import { type NextRequest } from 'next/server'
import { WalletService } from '@/domains/payments/WalletService'
import { ShortfallService } from '@/domains/payments/ShortfallService'
import { apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'

/** GET /api/v1/wallet — current balance (total, reserved, available), any outstanding session balance owed, and the 10 most recent ledger entries. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const [balance, { transactions, total }, outstandingPence] = await Promise.all([
      WalletService.getBalance(userId),
      WalletService.getHistory(userId, 1, 10),
      ShortfallService.outstandingPence(userId),
    ])
    return apiResponse({ balance, outstandingPence, recentTransactions: transactions, totalTransactions: total })
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/wallet')
  }
}
