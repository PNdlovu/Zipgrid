/**
 * @file EarningsAllocator.ts
 * @description Splits a transaction's host earnings between beneficiaries and
 * records them in earnings_allocations (the ledger payouts are paid from).
 *
 *   Listing not in a property             → 100% host
 *   Property, revenue_model = 'property'  → 100% property owner (the host)
 *   Property, revenue_model = 'resident'  → 100% the bay's assigned resident
 *   Property, revenue_model = 'split'     → split_property_pct to the owner,
 *                                           the rest to the bay's resident
 * A resident share falls back to the owner when the bay has no active resident.
 *
 * Refunds are recorded as negative allocations in the same proportions, so a
 * refund after capture reduces what each beneficiary is paid.
 *
 * @module domains/payments
 */

import type { Db } from '@/lib/db'

type Allocation = { beneficiaryUserId: string; share: 'host' | 'property' | 'resident'; amountPence: number }

/** Works out the split for a transaction (no writes). */
async function plan(tx: Db, transactionId: string, totalPence: number): Promise<Allocation[]> {
  const res = await tx.execute(
    `SELECT hp.user_id AS host_user_id,
            p.id AS property_id, p.revenue_model, p.split_property_pct,
            pr.user_id AS resident_user_id
     FROM transactions t
     JOIN bookings b          ON b.id = t.booking_id
     JOIN charger_listings cl ON cl.id = b.listing_id
     JOIN host_profiles hp    ON hp.id = cl.host_profile_id
     LEFT JOIN property_bays pb      ON pb.listing_id = cl.id
     LEFT JOIN properties p          ON p.id = pb.property_id AND p.archived_at IS NULL
     LEFT JOIN property_residents pr ON pr.id = pb.assigned_resident_id AND pr.status = 'active'
     WHERE t.id = $1`,
    [transactionId],
  )
  const r = res.rows[0]
  if (!r) return []
  const host = r['host_user_id'] as string
  if (!r['property_id']) return [{ beneficiaryUserId: host, share: 'host', amountPence: totalPence }]

  const resident = r['resident_user_id'] as string | null
  const model = r['revenue_model'] as 'property' | 'resident' | 'split'
  const propertyPct = model === 'property' ? 100 : model === 'resident' ? 0 : Number(r['split_property_pct'])
  const propertyPence = resident ? Math.round((totalPence * propertyPct) / 100) : totalPence
  const residentPence = totalPence - propertyPence

  const out: Allocation[] = []
  if (propertyPence !== 0) out.push({ beneficiaryUserId: host, share: 'property', amountPence: propertyPence })
  if (resident && residentPence !== 0) out.push({ beneficiaryUserId: resident, share: 'resident', amountPence: residentPence })
  return out
}

export const EarningsAllocator = {
  /** Records the capture allocations for a transaction (idempotent). */
  async allocateCapture(tx: Db, transactionId: string, hostEarningsPence: number): Promise<void> {
    if (hostEarningsPence <= 0) return
    for (const a of await plan(tx, transactionId, hostEarningsPence)) {
      await tx.execute(
        `INSERT INTO earnings_allocations (transaction_id, beneficiary_user_id, share, amount_pence, reason)
         VALUES ($1, $2, $3, $4, 'capture')
         ON CONFLICT (transaction_id, beneficiary_user_id, share, reason) DO NOTHING`,
        [transactionId, a.beneficiaryUserId, a.share, a.amountPence],
      )
    }
  },

  /**
   * Records a refund against the beneficiaries. `hostEarningsReductionPence`
   * is how much of the refund comes out of host earnings (refund × (1 − fee)).
   * `reason` must be unique per refund event (e.g. `refund:<disputeId>`).
   */
  async allocateRefund(tx: Db, transactionId: string, hostEarningsReductionPence: number, reason: string): Promise<void> {
    if (hostEarningsReductionPence <= 0) return
    for (const a of await plan(tx, transactionId, hostEarningsReductionPence)) {
      await tx.execute(
        `INSERT INTO earnings_allocations (transaction_id, beneficiary_user_id, share, amount_pence, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (transaction_id, beneficiary_user_id, share, reason) DO NOTHING`,
        [transactionId, a.beneficiaryUserId, a.share, -a.amountPence, reason.slice(0, 40)],
      )
    }
  },
}
