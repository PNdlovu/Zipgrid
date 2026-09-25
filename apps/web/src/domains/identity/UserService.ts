/**
 * @file UserService.ts
 * @description User profile service — get, update user accounts and profiles.
 *
 * @module domains/identity
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { getDb } from '@/lib/db'
import { NotFoundError, ForbiddenError } from '@/lib/errors/AppError'

export type UserRecord = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  phoneNumber: string | null
  phoneVerified: boolean
  emailVerified: boolean
  kycStatus: string
  roles: string[]
  aiMode: string
  createdAt: Date
}

/**
 * User profile service for the identity bounded context.
 */
export const UserService = {
  /**
   * Retrieves a user by ID.
   * @throws {NotFoundError} if user does not exist
   */
  async getById(userId: string): Promise<UserRecord> {
    const db = await getDb()
    const result = await db.execute(
      `SELECT id, email, display_name, avatar_url, phone_number, phone_verified,
              email_verified, kyc_status, roles, ai_mode, created_at
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (result.rows.length === 0) throw new NotFoundError('User', userId)

    const row = result.rows[0] as {
      id: string; email: string; display_name: string; avatar_url: string | null;
      phone_number: string | null; phone_verified: boolean; email_verified: boolean;
      kyc_status: string; roles: string[]; ai_mode: string; created_at: Date;
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      phoneNumber: row.phone_number,
      phoneVerified: row.phone_verified,
      emailVerified: row.email_verified,
      kycStatus: row.kyc_status,
      roles: row.roles,
      aiMode: row.ai_mode,
      createdAt: new Date(row.created_at),
    }
  },

  /**
   * Updates a user's display name or avatar.
   * @throws {ForbiddenError} if requestingUserId !== userId
   */
  async updateProfile(
    userId: string,
    requestingUserId: string,
    updates: { displayName?: string; avatarUrl?: string },
  ): Promise<void> {
    if (userId !== requestingUserId) throw new ForbiddenError()

    const db = await getDb()
    const sets: string[] = []
    const params: unknown[] = []
    let i = 1

    if (updates.displayName !== undefined) {
      sets.push(`display_name = $${i++}`)
      params.push(updates.displayName)
    }
    if (updates.avatarUrl !== undefined) {
      sets.push(`avatar_url = $${i++}`)
      params.push(updates.avatarUrl)
    }
    if (sets.length === 0) return

    sets.push(`updated_at = NOW()`)
    params.push(userId)

    await db.execute(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`,
      params,
    )
  },
}
