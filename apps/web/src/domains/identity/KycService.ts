/**
 * @file KycService.ts
 * @description KYC (Know Your Customer) verification service.
 * Uses Stripe Identity for document + selfie verification.
 *
 * Flow:
 *   1. Client calls initiateVerification() → gets a Stripe verification_session client_secret
 *   2. Frontend loads Stripe Identity SDK with the client_secret
 *   3. User completes verification (ID scan + selfie)
 *   4. Stripe sends webhook to /api/v1/webhooks/stripe
 *   5. handleWebhookEvent() processes identity.verification_session.verified / .requires_input
 *   6. User's kyc_status is updated in the DB; KYC_VERIFIED event published
 *
 * @module domains/identity
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import Stripe from 'stripe'
import { getDb } from '@/lib/db'
import { eventBus } from '@/lib/events/event-bus'
import { NotFoundError, ValidationError } from '@/lib/errors/AppError'
import { AuditLogger } from '@/domains/compliance/AuditLogger'

export type KycStatus = 'not_started' | 'pending' | 'verified' | 'rejected'

export type KycState = {
  userId: string
  status: KycStatus
  verificationSessionId: string | null
  verifiedAt: Date | null
  rejectionReason: string | null
}

/* ── Stripe client ──────────────────────────────────────────── */

let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env['STRIPE_SECRET_KEY']
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  return _stripe
}

/* ── Service ────────────────────────────────────────────────── */

export const KycService = {

  /**
   * Creates a Stripe Identity VerificationSession for a user.
   * Returns the client_secret to pass to the Stripe Identity frontend SDK.
   *
   * @throws {ValidationError} if user is already verified
   */
  async initiateVerification(userId: string): Promise<{
    verificationSessionId: string
    clientSecret: string
  }> {
    const db = await getDb()

    const userRes = await db.execute(
      `SELECT id, email, kyc_status FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (userRes.rows.length === 0) throw new NotFoundError('User', userId)

    const user = userRes.rows[0] as { id: string; email: string; kyc_status: string }
    if (user.kyc_status === 'verified') {
      throw new ValidationError('Identity has already been verified.')
    }

    const stripe = getStripe()
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      options: {
        document: {
          allowed_types: ['passport', 'driving_license', 'id_card'],
          require_id_number: false,
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
      metadata: {
        user_id: userId,
        platform: 'zipgrid',
      },
      return_url: `${process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'}/profile/kyc/complete`,
    })

    // Store the verification session id
    await db.execute(
      `UPDATE users
       SET kyc_status = 'pending',
           kyc_verification_session_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, session.id],
    )

    return {
      verificationSessionId: session.id,
      clientSecret: session.client_secret ?? '',
    }
  },

  /**
   * Returns the current KYC state for a user.
   */
  async getStatus(userId: string): Promise<KycState> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, kyc_status, kyc_verification_session_id,
              kyc_verified_at, kyc_rejection_reason
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (res.rows.length === 0) throw new NotFoundError('User', userId)

    const r = res.rows[0] as {
      id: string
      kyc_status: string
      kyc_verification_session_id: string | null
      kyc_verified_at: string | null
      kyc_rejection_reason: string | null
    }

    return {
      userId,
      // DB enum uses 'failed'; the API exposes it as 'rejected'.
      status: (r.kyc_status === 'failed' ? 'rejected' : r.kyc_status) as KycStatus,
      verificationSessionId: r.kyc_verification_session_id,
      verifiedAt: r.kyc_verified_at ? new Date(r.kyc_verified_at) : null,
      rejectionReason: r.kyc_rejection_reason,
    }
  },

  /**
   * Handles incoming Stripe Identity webhook events.
   * Called from the Stripe webhook route handler.
   *
   * Handled events:
   *   identity.verification_session.verified       → kyc_status = 'verified'
   *   identity.verification_session.requires_input → kyc_status = 'rejected' (with reason)
   *   identity.verification_session.canceled       → kyc_status = 'not_started'
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    const db = await getDb()

    if (event.type === 'identity.verification_session.verified') {
      const session = event.data.object as Stripe.Identity.VerificationSession
      const userId = session.metadata?.['user_id']
      if (!userId) return

      await db.execute(
        `UPDATE users
         SET kyc_status = 'verified',
             kyc_verified_at = NOW(),
             kyc_rejection_reason = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [userId],
      )

      eventBus.publish({ type: 'KYC_VERIFIED', userId })
    }

    if (event.type === 'identity.verification_session.requires_input') {
      const session = event.data.object as Stripe.Identity.VerificationSession
      const userId = session.metadata?.['user_id']
      if (!userId) return

      // Extract the reason from the last error if available
      const lastError = session.last_error
      const reason = lastError
        ? `${lastError.code ?? 'unknown'}: ${lastError.reason ?? 'Verification could not be completed'}`
        : 'Verification requires re-submission'

      await db.execute(
        `UPDATE users
         SET kyc_status = 'failed',
             kyc_rejection_reason = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [userId, reason],
      )
    }

    if (event.type === 'identity.verification_session.canceled') {
      const session = event.data.object as Stripe.Identity.VerificationSession
      const userId = session.metadata?.['user_id']
      if (!userId) return

      await db.execute(
        `UPDATE users
         SET kyc_status = 'not_started',
             kyc_verification_session_id = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [userId],
      )
    }
  },

  /**
   * Admin: manually overrides KYC status (e.g. for beta users or manual review).
   * Creates an audit log entry.
   */
  async adminOverride(
    userId: string,
    status: 'verified' | 'rejected',
    reason: string,
    adminUserId: string,
  ): Promise<void> {
    const db = await getDb()
    const verified = status === 'verified'
    await db.execute(
      `UPDATE users
       SET kyc_status = $2::kyc_status,
           kyc_verified_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
           kyc_rejection_reason = CASE WHEN $3 THEN NULL ELSE $4 END,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, verified ? 'verified' : 'failed', verified, reason],
    )

    if (verified) {
      eventBus.publish({ type: 'KYC_VERIFIED', userId })
    }

    await AuditLogger.logAsync({
      eventType: 'admin.kyc_override',
      actorId: adminUserId,
      targetId: userId,
      targetType: 'user',
      metadata: { status, reason },
    })
  },
}
