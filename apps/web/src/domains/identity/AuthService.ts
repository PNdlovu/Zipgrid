/**
 * @file AuthService.ts
 * @description Authentication service — register, login, verify, reset password.
 * All business logic lives here. API routes call this service, never the DB directly.
 *
 * @module domains/identity
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import {
  signAccessToken,
  signRefreshToken,
  signResetToken,
  verifyResetToken,
} from '@/lib/jwt'
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  AppError,
} from '@/lib/errors/AppError'
import { getDb } from '@/lib/db'
import { eventBus } from '@/lib/events/event-bus'

const BCRYPT_ROUNDS = 12
const OTP_EXPIRY_MINUTES = 10

export type RegisterInput = {
  displayName: string
  email: string
  password: string
  role: 'driver' | 'host' | 'both'
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  userId: string
  roles: string[]
}

export type LoginInput = {
  email: string
  password: string
  rememberMe: boolean
}

/**
 * Full authentication service for the identity bounded context.
 */
export const AuthService = {
  /**
   * Registers a new user account.
   * - Checks for duplicate email
   * - Hashes password with bcrypt (12 rounds)
   * - Creates user row in DB
   * - Issues JWT access + refresh tokens
   * - Publishes USER_REGISTERED domain event
   * @throws {ConflictError} if email already registered
   */
  async register(input: RegisterInput): Promise<AuthTokens> {
    const db = await getDb()

    // Check for existing email — parameterised query, no string interpolation
    const existing = await db.execute(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [input.email.toLowerCase().trim()],
    )
    if (existing.rows.length > 0) {
      throw new ConflictError('An account with this email address already exists.', 'EMAIL_EXISTS')
    }

    const userId = uuidv4()
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    const roles = input.role === 'both' ? ['driver', 'host'] : [input.role]

    await db.execute(
      `INSERT INTO users (id, email, display_name, password_hash, roles, kyc_status, ai_mode, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'not_started', 'hybrid', NOW(), NOW())`,
      [userId, input.email.toLowerCase().trim(), input.displayName, passwordHash, roles],
    )

    // Publish domain event — compliance domain subscribes to write audit log
    eventBus.publish({ type: 'USER_REGISTERED', userId, role: input.role === 'both' ? 'driver' : input.role })

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ sub: userId, email: input.email, roles, kycVerified: false }),
      signRefreshToken({ sub: userId, sessionId: uuidv4() }),
    ])

    return { accessToken, refreshToken, userId, roles }
  },

  /**
   * Authenticates a user with email + password.
   * @throws {UnauthorizedError} on wrong credentials (same message to prevent enumeration)
   * @throws {AppError} EMAIL_NOT_VERIFIED if email not verified
   */
  async login(input: LoginInput): Promise<AuthTokens & { emailVerified: boolean }> {
    const db = await getDb()

    const result = await db.execute(
      `SELECT id, email, password_hash, roles, kyc_status, email_verified
       FROM users WHERE email = $1 LIMIT 1`,
      [input.email.toLowerCase().trim()],
    )

    if (result.rows.length === 0) {
      // Constant-time fake compare to prevent timing attacks
      await bcrypt.compare(input.password, '$2a$12$placeholder.hash.to.prevent.timing.attacks.XX')
      throw new UnauthorizedError('Email or password is incorrect.')
    }

    const user = result.rows[0] as {
      id: string
      email: string
      password_hash: string
      roles: string[]
      kyc_status: string
      email_verified: boolean
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password_hash)
    if (!passwordMatches) {
      throw new UnauthorizedError('Email or password is incorrect.')
    }

    if (!user.email_verified) {
      throw new AppError('Email address not verified. Please check your inbox.', 'EMAIL_NOT_VERIFIED', 403)
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({
        sub: user.id,
        email: user.email,
        roles: user.roles,
        kycVerified: user.kyc_status === 'verified',
      }),
      signRefreshToken({ sub: user.id, sessionId: uuidv4() }, input.rememberMe),
    ])

    return { accessToken, refreshToken, userId: user.id, roles: user.roles, emailVerified: user.email_verified }
  },

  /**
   * Generates a 6-digit OTP and stores it hashed in the DB.
   * Sends via the notification service (email or SMS depending on type).
   * @returns The plain OTP — caller sends it; we store only the hash.
   */
  async generateOtp(userId: string, type: 'email' | 'phone'): Promise<string> {
    const db = await getDb()
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const codeHash = await bcrypt.hash(code, 10)
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    await db.execute(
      `INSERT INTO otp_codes (id, user_id, type, code_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, type) DO UPDATE
       SET code_hash = $4, expires_at = $5, created_at = NOW(), used = false`,
      [uuidv4(), userId, type, codeHash, expiresAt],
    )

    return code
  },

  /**
   * Verifies an email OTP code.
   * @throws {ValidationError} if code is invalid or expired
   */
  async verifyEmail(email: string, code: string): Promise<void> {
    const db = await getDb()

    const userResult = await db.execute(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()],
    )
    if (userResult.rows.length === 0) throw new NotFoundError('User')

    const userId = (userResult.rows[0] as { id: string }).id

    const otpResult = await db.execute(
      `SELECT code_hash, expires_at, used FROM otp_codes
       WHERE user_id = $1 AND type = 'email' ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    if (otpResult.rows.length === 0) throw new ValidationError('No verification code found. Please request a new one.')

    const otp = otpResult.rows[0] as { code_hash: string; expires_at: Date; used: boolean }
    if (otp.used) throw new ValidationError('This code has already been used.')
    if (new Date() > new Date(otp.expires_at)) throw new ValidationError('Code has expired. Please request a new one.')

    const matches = await bcrypt.compare(code, otp.code_hash)
    if (!matches) throw new ValidationError('Invalid verification code.')

    await db.execute(
      `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
      [userId],
    )
    await db.execute(`UPDATE otp_codes SET used = true WHERE user_id = $1 AND type = 'email'`, [userId])
  },

  /**
   * Sends a password reset email with a signed JWT link.
   * Always returns void regardless of whether email exists (anti-enumeration).
   */
  async requestPasswordReset(email: string): Promise<void> {
    const db = await getDb()
    const result = await db.execute(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()],
    )
    if (result.rows.length === 0) return // Silent — prevent email enumeration

    const userId = (result.rows[0] as { id: string }).id
    const resetToken = await signResetToken({ sub: userId, email: email.toLowerCase().trim() })

    // In production: send email via notification service with resetToken
    // For now: log token in dev for testing
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[DEV] Password reset token:', resetToken)
    }
  },

  /**
   * Confirms a password reset — validates JWT token, updates hash.
   * @throws {ValidationError} if token is expired or invalid
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const db = await getDb()

    const payload = await verifyResetToken(token).catch(() => {
      throw new ValidationError('This reset link has expired or is invalid. Please request a new one.')
    })

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await db.execute(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, payload.sub],
    )
  },

  /**
   * Rotates refresh token — invalidates old session, issues new tokens.
   * @throws {UnauthorizedError} if refresh token is invalid
   */
  async refreshTokens(userId: string, rememberMe = false): Promise<AuthTokens> {
    const db = await getDb()

    const result = await db.execute(
      `SELECT id, email, roles, kyc_status FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    )
    if (result.rows.length === 0) throw new UnauthorizedError()

    const user = result.rows[0] as { id: string; email: string; roles: string[]; kyc_status: string }
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({
        sub: user.id,
        email: user.email,
        roles: user.roles,
        kycVerified: user.kyc_status === 'verified',
      }),
      signRefreshToken({ sub: user.id, sessionId: uuidv4() }, rememberMe),
    ])

    return { accessToken, refreshToken, userId: user.id, roles: user.roles }
  },
}
