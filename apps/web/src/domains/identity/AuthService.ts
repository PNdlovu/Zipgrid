/**
 * @file AuthService.ts
 * @description Identity: registration, login, email/phone verification,
 * password reset and OAuth sign-in. Session/token lifecycle lives in
 * lib/auth/sessions.ts.
 *
 * Email verification is required to log in when REQUIRE_EMAIL_VERIFICATION is
 * "true", or — when unset — whenever an email provider is configured (so the
 * platform stays usable before Resend is connected).
 *
 * @module domains/identity
 */

import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { signResetToken, verifyResetToken } from '@/lib/jwt'
import {
  AppError,
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors/AppError'
import { getDb, transaction, type Db } from '@/lib/db'
import { eventBus } from '@/lib/events/event-bus'
import { escapeHtml, isEmailConfigured, sendEmail } from '@/lib/email'
import { createSession, revokeAllSessions, type IssuedTokens, type SessionContext } from '@/lib/auth/sessions'

const BCRYPT_ROUNDS = 12
const OTP_EXPIRY_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5
// Valid bcrypt hash of a random string — used to equalise timing for unknown emails.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5kCJ2D8yeeq0F7OSUkg0Y2C5Xy7t6Zu'

export type RegisterInput = {
  displayName: string
  email: string
  password: string
  role: 'driver' | 'host' | 'both'
}

export type LoginInput = {
  email: string
  password: string
  rememberMe: boolean
}

/** True when sign-in requires a verified email (REQUIRE_EMAIL_VERIFICATION). */
export function isEmailVerificationRequired(): boolean {
  const flag = process.env['REQUIRE_EMAIL_VERIFICATION']
  if (flag === 'true') return true
  if (flag === 'false') return false
  return isEmailConfigured()
}

const normaliseEmail = (email: string) => email.toLowerCase().trim()

/** Creates driver/host profile rows for the roles a user holds (idempotent). */
export async function ensureProfiles(db: Db, userId: string, roles: string[]): Promise<void> {
  if (roles.includes('driver')) {
    await db.execute(
      `INSERT INTO driver_profiles (user_id) SELECT $1
       WHERE NOT EXISTS (SELECT 1 FROM driver_profiles WHERE user_id = $1)`,
      [userId],
    )
  }
  if (roles.includes('host')) {
    await db.execute(
      `INSERT INTO host_profiles (user_id) SELECT $1
       WHERE NOT EXISTS (SELECT 1 FROM host_profiles WHERE user_id = $1)`,
      [userId],
    )
  }
}

export const AuthService = {
  /**
   * Registers a new account with driver and/or host profiles, sends the email
   * verification code and returns a logged-in session.
   * @throws {ConflictError} EMAIL_EXISTS
   */
  async register(input: RegisterInput, ctx: SessionContext = {}): Promise<IssuedTokens & { requiresVerification: boolean }> {
    const email = normaliseEmail(input.email)
    const roles = input.role === 'both' ? ['driver', 'host'] : [input.role]
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    const userId = uuidv4()

    await transaction(async (tx) => {
      const existing = await tx.execute(`SELECT 1 FROM users WHERE email = $1`, [email])
      if (existing.rows.length > 0) {
        throw new ConflictError('An account with this email address already exists.', 'EMAIL_EXISTS')
      }
      await tx.execute(
        `INSERT INTO users (id, email, full_name, display_name, password_hash, roles,
                            account_status, kyc_status, password_changed_at)
         VALUES ($1, $2, $3, $3, $4, $5::user_role[], 'active', 'not_started', NOW())`,
        [userId, email, input.displayName.trim(), passwordHash, roles],
      )
      await ensureProfiles(tx, userId, roles)
    })

    eventBus.publish({ type: 'USER_REGISTERED', userId, role: roles.includes('host') ? 'host' : 'driver' })
    await this.sendEmailVerification(userId).catch((err: unknown) => console.error('[AuthService.register] OTP email', err))

    const requiresVerification = isEmailVerificationRequired()
    const tokens = await createSession(userId, false, ctx)
    return { ...tokens, requiresVerification }
  },

  /**
   * Authenticates with email + password. Same error for unknown email and wrong
   * password; constant work in both cases.
   * @throws {UnauthorizedError}
   * @throws {AppError} EMAIL_NOT_VERIFIED (403), ACCOUNT_SUSPENDED (403)
   */
  async login(input: LoginInput, ctx: SessionContext = {}): Promise<IssuedTokens & { emailVerified: boolean }> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, password_hash, account_status, deleted_at, email_verified
       FROM users WHERE email = $1`,
      [normaliseEmail(input.email)],
    )
    const user = res.rows[0] as {
      id: string
      password_hash: string | null
      account_status: string
      deleted_at: string | null
      email_verified: boolean
    } | undefined

    const matches = await bcrypt.compare(input.password, user?.password_hash || DUMMY_HASH)
    if (!user || !user.password_hash || user.deleted_at || !matches) {
      throw new UnauthorizedError('Email or password is incorrect.')
    }
    if (user.account_status === 'suspended' || user.account_status === 'deactivated') {
      throw new AppError('This account has been suspended. Please contact support.', 'ACCOUNT_SUSPENDED', 403)
    }
    if (!user.email_verified && isEmailVerificationRequired()) {
      throw new AppError('Email address not verified. Please check your inbox.', 'EMAIL_NOT_VERIFIED', 403)
    }

    const tokens = await createSession(user.id, input.rememberMe, ctx)
    return { ...tokens, emailVerified: user.email_verified }
  },

  /** Generates and stores (hashed) a fresh 6-digit OTP. Returns the plain code. */
  async generateOtp(userId: string, type: 'email' | 'phone'): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const db = await getDb()
    await db.execute(
      `INSERT INTO otp_codes (user_id, type, code_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))
       ON CONFLICT (user_id, type) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
           created_at = NOW(), used = FALSE, attempts = 0`,
      [userId, type, await bcrypt.hash(code, 10), OTP_EXPIRY_MINUTES],
    )
    return code
  },

  /** Checks an OTP, enforcing expiry, single use and a 5-attempt limit. */
  async _consumeOtp(userId: string, type: 'email' | 'phone', code: string): Promise<void> {
    await transaction(async (tx) => {
      const res = await tx.execute(
        `SELECT code_hash, used, attempts, expires_at < NOW() AS expired
         FROM otp_codes WHERE user_id = $1 AND type = $2 FOR UPDATE`,
        [userId, type],
      )
      const otp = res.rows[0]
      if (!otp) throw new ValidationError('No verification code found. Please request a new one.', 'OTP_NOT_FOUND')
      if (otp['used']) throw new ValidationError('This code has already been used.', 'OTP_USED')
      if (otp['expired']) throw new ValidationError('Code has expired. Please request a new one.', 'OTP_EXPIRED')
      if (Number(otp['attempts']) >= OTP_MAX_ATTEMPTS) {
        throw new ValidationError('Too many incorrect attempts. Please request a new code.', 'OTP_LOCKED')
      }
      if (!(await bcrypt.compare(code, otp['code_hash'] as string))) {
        await tx.execute(`UPDATE otp_codes SET attempts = attempts + 1 WHERE user_id = $1 AND type = $2`, [userId, type])
        throw new ValidationError('Invalid verification code.', 'OTP_INVALID')
      }
      await tx.execute(`UPDATE otp_codes SET used = TRUE WHERE user_id = $1 AND type = $2`, [userId, type])
    })
  },

  async verifyEmail(email: string, code: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(`SELECT id FROM users WHERE email = $1`, [normaliseEmail(email)])
    const userId = res.rows[0]?.['id'] as string | undefined
    // Same error as a wrong code so the endpoint can't be used to probe emails.
    if (!userId) throw new ValidationError('Invalid verification code.', 'OTP_INVALID')
    await this._consumeOtp(userId, 'email', code)
    await db.execute(
      `UPDATE users SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [userId],
    )
    eventBus.publish({ type: 'EMAIL_VERIFIED', userId })
  },

  async verifyPhone(phone: string, code: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(`SELECT id FROM users WHERE phone = $1`, [phone.replace(/\s+/g, '')])
    const userId = res.rows[0]?.['id'] as string | undefined
    if (!userId) throw new ValidationError('Invalid verification code.', 'OTP_INVALID')
    await this._consumeOtp(userId, 'phone', code)
    await db.execute(
      `UPDATE users SET phone_verified = TRUE, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId],
    )
  },

  /** Generates and emails a verification code if the email is not yet verified. */
  async sendEmailVerification(userId: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT email, COALESCE(display_name, full_name) AS name, email_verified FROM users WHERE id = $1`,
      [userId],
    )
    const u = res.rows[0]
    if (!u || u['email_verified']) return
    const code = await this.generateOtp(userId, 'email')
    await sendEmail(otpEmail(u['email'] as string, u['name'] as string, code))
  },

  /** Generates and texts a phone verification code via Twilio (logged in dev). */
  async sendPhoneVerification(userId: string, phone: string): Promise<void> {
    const code = await this.generateOtp(userId, 'phone')
    const sid = process.env['TWILIO_ACCOUNT_SID']
    const token = process.env['TWILIO_AUTH_TOKEN']
    const from = process.env['TWILIO_PHONE_NUMBER'] ?? process.env['TWILIO_FROM_NUMBER']
    if (!sid || !token || !from) {
      if (process.env.NODE_ENV !== 'production') console.warn(`[sms:dev] OTP for ${phone}: ${code}`)
      else console.warn('[sms] Twilio not configured — phone verification code not sent')
      return
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        From: from,
        Body: `Your Zipgrid verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    }).catch((err: unknown) => { console.error('[sms] send failed', err); return null })
    if (res && !res.ok) console.error(`[sms] Twilio responded ${res.status}`)
  },

  /** Emails a single-use reset link if the account exists. Never reveals existence. */
  async requestPasswordReset(email: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, email, COALESCE(display_name, full_name) AS name FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [normaliseEmail(email)],
    )
    const u = res.rows[0]
    if (!u) return
    const token = await signResetToken({ sub: u['id'] as string, email: u['email'] as string })
    const link = `${process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'}/reset-password?token=${encodeURIComponent(token)}`
    await sendEmail({
      to: u['email'] as string,
      subject: 'Reset your Zipgrid password',
      text: `Hi ${u['name'] as string},\n\nReset your password using this link (valid for 30 minutes):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Hi ${escapeHtml(u['name'] as string)},</p>
             <p><a href="${escapeHtml(link)}">Reset your password</a> — the link is valid for 30 minutes.</p>
             <p>If you didn't request this, you can ignore this email.</p>`,
    })
  },

  /**
   * Sets a new password from a reset token. Tokens are single-use: any token
   * issued before the last password change is rejected. Ends all sessions.
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const invalid = () => new ValidationError('This reset link has expired or is invalid. Please request a new one.', 'RESET_TOKEN_INVALID')
    const payload = await verifyResetToken(token).catch(() => { throw invalid() })
    const issuedAt = new Date(((payload as { iat?: number }).iat ?? 0) * 1000)

    const db = await getDb()
    const res = await db.execute(
      `UPDATE users SET password_hash = $2, password_changed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
         AND (password_changed_at IS NULL OR password_changed_at < $3)
       RETURNING id`,
      [payload.sub, await bcrypt.hash(newPassword, BCRYPT_ROUNDS), issuedAt.toISOString()],
    )
    if (res.rows.length === 0) throw invalid()
    await revokeAllSessions(payload.sub)
  },

  /** Changes the password for a logged-in user and ends their other sessions. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const db = await getDb()
    const res = await db.execute(`SELECT password_hash FROM users WHERE id = $1`, [userId])
    const hash = res.rows[0]?.['password_hash'] as string | null | undefined
    if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
      throw new UnauthorizedError('Current password is incorrect.')
    }
    await db.execute(
      `UPDATE users SET password_hash = $2, password_changed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId, await bcrypt.hash(newPassword, BCRYPT_ROUNDS)],
    )
    await revokeAllSessions(userId)
  },

  /**
   * Signs in with a verified OAuth identity. Accounts are matched by provider
   * subject first; an existing email account is only linked when the provider
   * has verified that email. New accounts start as drivers.
   */
  async oauthSignIn(input: {
    provider: 'google' | 'apple'
    providerId: string
    email: string
    fullName: string
    avatarUrl: string | null
    emailVerified: boolean
  }, ctx: SessionContext = {}): Promise<IssuedTokens> {
    const subColumn = input.provider === 'google' ? 'google_sub' : 'apple_sub'
    const email = normaliseEmail(input.email)

    const userId = await transaction(async (tx) => {
      const bySub = await tx.execute(`SELECT id FROM users WHERE ${subColumn} = $1`, [input.providerId])
      if (bySub.rows[0]) return bySub.rows[0]['id'] as string

      const byEmail = await tx.execute(`SELECT id FROM users WHERE email = $1`, [email])
      if (byEmail.rows[0]) {
        if (!input.emailVerified) {
          throw new AppError(
            'An account with this email already exists. Sign in with your password to link this provider.',
            'OAUTH_EMAIL_UNVERIFIED',
            409,
          )
        }
        const id = byEmail.rows[0]['id'] as string
        await tx.execute(
          // sql-check: ignore — column name is the provider sub column
          `UPDATE users SET ${subColumn} = $2, avatar_url = COALESCE(avatar_url, $3),
                  email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [id, input.providerId, input.avatarUrl],
        )
        return id
      }

      if (!input.emailVerified) {
        throw new AppError('Your provider has not verified this email address.', 'OAUTH_EMAIL_UNVERIFIED', 400)
      }
      const id = uuidv4()
      await tx.execute(
        `INSERT INTO users (id, email, full_name, display_name, avatar_url, roles, account_status,
                            kyc_status, email_verified, email_verified_at, ${subColumn})
         VALUES ($1, $2, $3, $3, $4, '{driver}', 'active', 'not_started', TRUE, NOW(), $5)`,
        [id, email, input.fullName, input.avatarUrl, input.providerId],
      )
      await ensureProfiles(tx, id, ['driver'])
      eventBus.publish({ type: 'USER_REGISTERED', userId: id, role: 'driver' })
      return id
    })

    const db = await getDb()
    const status = await db.execute(`SELECT account_status, deleted_at FROM users WHERE id = $1`, [userId])
    const s = status.rows[0]
    if (!s || s['deleted_at'] || ['suspended', 'deactivated'].includes(s['account_status'] as string)) {
      throw new AppError('This account has been suspended. Please contact support.', 'ACCOUNT_SUSPENDED', 403)
    }
    return createSession(userId, true, ctx)
  },
}

function otpEmail(to: string, name: string, code: string) {
  return {
    to,
    subject: 'Verify your Zipgrid email address',
    text: `Hi ${name},\n\nYour Zipgrid verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't create a Zipgrid account, you can ignore this email.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px">
      <h1 style="margin:0 0 8px;font-size:22px;color:#0a0a0a">Verify your email</h1>
      <p style="color:#555;line-height:1.6">Hi ${escapeHtml(name)}, here is your 6-digit code. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
      <p style="text-align:center;margin:24px 0"><span style="display:inline-block;letter-spacing:.3em;font-size:32px;font-weight:700;font-family:monospace;background:#f5f5f5;border-radius:8px;padding:14px 24px">${code}</span></p>
      <p style="color:#999;font-size:13px">If you didn't create a Zipgrid account, you can ignore this email.</p>
    </div>`,
  }
}
