/**
 * @file route.ts
 * @description GET /api/health — liveness/readiness probe for Railway and
 * uptime monitors. 200 when the database answers, 503 otherwise. Reports which
 * integrations are configured (booleans only — never values).
 *
 * @module apps/web/api/health
 */

import { NextResponse } from 'next/server'
import { pingDb } from '@/lib/db'
import { hasEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** GET /api/health — liveness/readiness probe for Railway and uptime monitors. */
export async function GET() {
  const database = await pingDb()
  return NextResponse.json(
    {
      status: database ? 'ok' : 'degraded',
      database,
      configured: {
        auth: hasEnv('JWT_SECRET'),
        payments: hasEnv('STRIPE_SECRET_KEY'),
        stripeWebhooks: hasEnv('STRIPE_WEBHOOK_SECRET'),
        cardForm: hasEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
        email: hasEnv('RESEND_API_KEY'),
        scheduler: hasEnv('CRON_SECRET'),
      },
    },
    { status: database ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
