/**
 * @file route.ts
 * @description POST /api/v1/fleet/invite — Fleet admin invites a driver by email.
 * Creates a fleet_members row with status 'invited' and sends an invite email.
 *
 * @module apps/web/api/v1/fleet/invite
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError, ForbiddenError } from '@/lib/errors/AppError'

const BodySchema = z.object({
  email: z.string().email(),
})

/** POST /api/v1/fleet/invite — Fleet admin invites a driver by email. */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof BodySchema>
  try { body = BodySchema.parse(await request.json()) }
  catch { return apiError('VALIDATION_ERROR', 'Valid email is required', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify admin
    const adminRes = await db.execute(
      `SELECT fm.fleet_account_id
       FROM fleet_members fm
       WHERE fm.user_id = $1 AND fm.role = 'fleet_admin' AND fm.status = 'active'
       LIMIT 1`,
      [userId],
    )
    if (adminRes.rows.length === 0) throw new ForbiddenError('Fleet admin access required')
    const fleetId = (adminRes.rows[0] as { fleet_account_id: string }).fleet_account_id

    // Check if user already exists by email
    const userRes = await db.execute(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [body.email.toLowerCase().trim()],
    )
    const inviteeUserId = userRes.rows.length > 0
      ? (userRes.rows[0] as { id: string }).id
      : null

    // Check for duplicate invite
    if (inviteeUserId) {
      const dupRes = await db.execute(
        `SELECT id FROM fleet_members WHERE fleet_account_id = $1 AND user_id = $2 LIMIT 1`,
        [fleetId, inviteeUserId],
      )
      if (dupRes.rows.length > 0) {
        return apiError('CONFLICT', 'This user is already a member of your fleet', 409)
      }
    }

    // Create invite record
    const inviteId = crypto.randomUUID()
    if (inviteeUserId) {
      await db.execute(
        `INSERT INTO fleet_members (id, fleet_account_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'driver', 'invited', NOW(), NOW())`,
        [inviteId, fleetId, inviteeUserId],
      )
    }
    // If user doesn't exist: store invite token in a pending_invites table (future work)
    // For now: best-effort email send via Resend

    const resendKey = process.env['RESEND_API_KEY']
    if (resendKey) {
      const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    'Zipgrid <noreply@zipgrid.app>',
          to:      body.email,
          subject: 'You\'ve been invited to a Zipgrid fleet account',
          html:    `<p>You've been invited to join a corporate EV charging fleet on Zipgrid.</p>
                    <p><a href="${appUrl}/register">Create your account</a> to get started.</p>`,
        }),
        signal: AbortSignal.timeout(8_000),
      }).catch(() => { /* non-fatal */ })
    }

    return apiResponse({ invited: true, email: body.email }, undefined, 201)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code ?? 'APP_ERROR', err.message, err.statusCode ?? 400)
    console.error('[fleet/invite]', err)
    return apiError('INTERNAL_ERROR', 'Could not send invite', 500)
  }
}
