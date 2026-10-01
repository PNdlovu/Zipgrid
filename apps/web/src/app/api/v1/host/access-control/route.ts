/**
 * @file route.ts
 * @description GET/POST/DELETE /api/v1/host/access-control
 * SMB customer access control — white-list drivers for free or discounted charging.
 * Used by hotels, employers, and car parks to give customers/staff free sessions.
 *
 * GET  — list all access control rules for a listing
 * POST — add a rule (free charging / discount for an email/domain/QR code)
 * DELETE ?id= — remove a rule
 *
 * Also handles QR code generation for listing-specific access tokens.
 *
 * @module apps/web/api/v1/host/access-control
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, ForbiddenError } from '@/lib/errors/AppError'

const CreateRuleSchema = z.object({
  listingId:        z.string().uuid(),
  ruleType:         z.enum(['email', 'email_domain', 'qr_token', 'open']),
  /** Specific email for email rule, domain for domain rule (e.g. '@company.com'), blank for QR/open */
  value:            z.string().max(200).optional(),
  /** Discount 0–100%; 100 = free */
  discountPct:      z.number().int().min(0).max(100).default(100),
  /** Max sessions this rule can be used (null = unlimited) */
  maxUses:          z.number().int().positive().nullable().default(null),
  /** Human-readable label e.g. "Staff free charging" */
  label:            z.string().max(100).optional(),
  expiresAt:        z.string().datetime().nullable().optional(),
})

/** GET /api/v1/host/access-control?listingId= */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const listingId = request.nextUrl.searchParams.get('listingId')
  if (!listingId) return apiError('VALIDATION_ERROR', 'listingId is required', 400)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership
    const ownerRes = await db.execute(
      `SELECT cl.id FROM charger_listings cl
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE cl.id = $1 AND hp.user_id = $2 LIMIT 1`,
      [listingId, userId],
    )
    if (ownerRes.rows.length === 0) throw new ForbiddenError('You do not own this listing')

    const rulesRes = await db.execute(
      `SELECT id, listing_id, rule_type, value, discount_pct, max_uses, use_count,
              label, qr_token, expires_at, is_active, created_at
       FROM listing_access_rules
       WHERE listing_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC`,
      [listingId],
    )

    return apiResponse({ rules: rulesRes.rows })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not fetch access rules', 500)
  }
}

/** POST /api/v1/host/access-control */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof CreateRuleSchema>
  try { body = CreateRuleSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid input', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership
    const ownerRes = await db.execute(
      `SELECT cl.id FROM charger_listings cl
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE cl.id = $1 AND hp.user_id = $2 LIMIT 1`,
      [body.listingId, userId],
    )
    if (ownerRes.rows.length === 0) throw new ForbiddenError('You do not own this listing')

    // Generate QR token for qr_token rule types
    const qrToken = body.ruleType === 'qr_token'
      ? crypto.randomBytes(12).toString('hex').toUpperCase()
      : null

    const ruleId = crypto.randomUUID()
    await db.execute(
      `INSERT INTO listing_access_rules
         (id, listing_id, rule_type, value, discount_pct, max_uses, use_count,
          label, qr_token, expires_at, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,TRUE,NOW(),NOW())`,
      [
        ruleId, body.listingId, body.ruleType,
        body.value ?? null,
        body.discountPct,
        body.maxUses ?? null,
        body.label ?? null,
        qrToken,
        body.expiresAt ?? null,
      ],
    )

    // Build QR code data URL for qr_token type
    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'
    const qrData = qrToken
      ? `${appUrl}/charge?token=${qrToken}&listing=${body.listingId}`
      : null

    return apiResponse({ ruleId, qrToken, qrUrl: qrData }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not create access rule', 500)
  }
}

/** DELETE /api/v1/host/access-control?id= */
export async function DELETE(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const ruleId = request.nextUrl.searchParams.get('id')
  if (!ruleId) return apiError('VALIDATION_ERROR', 'id is required', 400)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify ownership via join
    const res = await db.execute(
      `UPDATE listing_access_rules lar
       SET is_active = FALSE, updated_at = NOW()
       FROM charger_listings cl
       JOIN host_profiles hp ON hp.id = cl.host_profile_id
       WHERE lar.id = $1 AND lar.listing_id = cl.id AND hp.user_id = $2`,
      [ruleId, userId],
    )

    return apiResponse({ removed: true, ruleId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    return apiError('INTERNAL_ERROR', 'Could not remove access rule', 500)
  }
}
