/**
 * @file sessions.ts
 * @description Database-backed login sessions with refresh-token rotation.
 *
 * Each login creates an auth_sessions row; the refresh JWT carries its
 * session_id. Every refresh revokes the presented session and issues a new
 * one. Presenting an already-revoked session (a replayed/stolen token) revokes
 * every session for that user.
 *
 * Access tokens are short-lived (15 min) and stateless; suspension, deletion,
 * logout and password changes take effect at the next refresh.
 *
 * @module lib/auth
 */

import { v4 as uuidv4 } from 'uuid'
import { getDb, transaction } from '@/lib/db'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@/lib/jwt'

export type IssuedTokens = {
  accessToken: string
  refreshToken: string
  userId: string
  roles: string[]
  rememberMe: boolean
}

export type SessionContext = { ip?: string | null; userAgent?: string | null }

const REFRESH_DAYS = { short: 7, long: 30 }
/** Window in which a just-rotated refresh token still resolves to its replacement. */
const ROTATION_GRACE_SECONDS = 30

type UserClaims = { id: string; email: string; roles: string[]; kyc_status: string }

async function loadActiveUser(userId: string): Promise<UserClaims | null> {
  const db = await getDb()
  const res = await db.execute(
    `SELECT id, email, roles, kyc_status FROM users
     WHERE id = $1 AND deleted_at IS NULL AND account_status NOT IN ('suspended', 'deactivated')`,
    [userId],
  )
  return (res.rows[0] as UserClaims | undefined) ?? null
}

function isIp(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f.:]+$/i.test(value))
}

/** Creates a session row and the token pair for it. */
export async function createSession(userId: string, rememberMe: boolean, ctx: SessionContext = {}): Promise<IssuedTokens> {
  const user = await loadActiveUser(userId)
  if (!user) throw new Error('User is not active')

  const sessionId = uuidv4()
  const days = rememberMe ? REFRESH_DAYS.long : REFRESH_DAYS.short
  const db = await getDb()
  await db.execute(
    `INSERT INTO auth_sessions (user_id, session_id, ip_address, user_agent, remember_me, expires_at)
     VALUES ($1, $2, $3::inet, $4, $5, NOW() + make_interval(days => $6))`,
    [userId, sessionId, isIp(ctx.ip) ? ctx.ip : null, ctx.userAgent?.slice(0, 500) ?? null, rememberMe, days],
  )
  return issue(user, sessionId, rememberMe)
}

async function issue(user: UserClaims, sessionId: string, rememberMe: boolean): Promise<IssuedTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      kycVerified: user.kyc_status === 'verified',
    }),
    signRefreshToken({ sub: user.id, sessionId }, rememberMe),
  ])
  return { accessToken, refreshToken, userId: user.id, roles: user.roles, rememberMe }
}

/**
 * Rotates a refresh token. Returns null when the token is invalid, expired,
 * revoked, or the user is no longer active.
 */
export async function rotateSession(refreshToken: string, ctx: SessionContext = {}): Promise<IssuedTokens | null> {
  let claims: { sub: string; sessionId: string }
  try {
    claims = await verifyRefreshToken(refreshToken)
  } catch {
    return null
  }

  const outcome = await transaction(async (tx) => {
    const res = await tx.execute(
      `SELECT user_id, revoked, remember_me, replaced_by,
              expires_at > NOW() AS live,
              revoked_at > NOW() - make_interval(secs => $2) AS within_grace
       FROM auth_sessions WHERE session_id = $1
       FOR UPDATE`,
      [claims.sessionId, ROTATION_GRACE_SECONDS],
    )
    const s = res.rows[0]
    if (!s || s['user_id'] !== claims.sub) return null
    if (s['revoked']) {
      // A concurrent request just rotated this token: hand back its replacement.
      if (s['replaced_by'] && s['within_grace']) {
        const replacement = await tx.execute(
          `SELECT session_id FROM auth_sessions WHERE session_id = $1 AND NOT revoked`,
          [s['replaced_by']],
        )
        if (replacement.rows[0]) {
          return { newSessionId: s['replaced_by'] as string, rememberMe: Boolean(s['remember_me']) }
        }
      }
      // Otherwise this is a replay of an old token: treat as theft.
      await tx.execute(`UPDATE auth_sessions SET revoked = TRUE, revoked_at = NOW() WHERE user_id = $1`, [claims.sub])
      return null
    }
    if (!s['live']) return null

    const newSessionId = uuidv4()
    const rememberMe = Boolean(s['remember_me'])
    await tx.execute(
      `UPDATE auth_sessions SET revoked = TRUE, revoked_at = NOW(), replaced_by = $2, last_used_at = NOW()
       WHERE session_id = $1`,
      [claims.sessionId, newSessionId],
    )
    await tx.execute(
      `INSERT INTO auth_sessions (user_id, session_id, ip_address, user_agent, remember_me, expires_at)
       VALUES ($1, $2, $3::inet, $4, $5, NOW() + make_interval(days => $6))`,
      [
        claims.sub, newSessionId, isIp(ctx.ip) ? ctx.ip : null, ctx.userAgent?.slice(0, 500) ?? null,
        rememberMe, rememberMe ? REFRESH_DAYS.long : REFRESH_DAYS.short,
      ],
    )
    return { newSessionId, rememberMe }
  })
  if (!outcome) return null

  const user = await loadActiveUser(claims.sub)
  if (!user) {
    await revokeAllSessions(claims.sub)
    return null
  }
  return issue(user, outcome.newSessionId, outcome.rememberMe)
}

/** Revokes the session behind a refresh token (logout). Never throws. */
export async function revokeSession(refreshToken: string): Promise<void> {
  try {
    const claims = await verifyRefreshToken(refreshToken)
    const db = await getDb()
    await db.execute(`UPDATE auth_sessions SET revoked = TRUE, revoked_at = NOW() WHERE session_id = $1`, [claims.sessionId])
  } catch {
    // invalid/expired token — nothing to revoke
  }
}

/** Ends every session for a user (password change, suspension, deletion). */
export async function revokeAllSessions(userId: string): Promise<void> {
  const db = await getDb()
  await db.execute(`UPDATE auth_sessions SET revoked = TRUE, revoked_at = NOW() WHERE user_id = $1 AND NOT revoked`, [userId])
}
