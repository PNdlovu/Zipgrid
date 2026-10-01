/**
 * @file route.ts
 * @description GET/POST /api/v1/white-label — White-label platform licensing API.
 * Allows property developers, councils, and utilities to licence the Zipgrid
 * platform under their own brand.
 *
 * GET  — returns the current white-label configuration for a tenant
 * POST — create or update a white-label tenant configuration
 *
 * @module apps/web/api/v1/white-label
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'

const WhiteLabelSchema = z.object({
  tenantSlug:       z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  brandName:        z.string().min(2).max(100),
  primaryColour:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#00C853'),
  secondaryColour:  z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#111111'),
  logoUrl:          z.string().url().optional(),
  faviconUrl:       z.string().url().optional(),
  customDomain:     z.string().optional(),
  supportEmail:     z.string().email().optional(),
  commissionRatePct: z.number().min(0).max(100).default(8),
  featureFlags: z.object({
    enableMarketplace: z.boolean().default(true),
    enableFleet:       z.boolean().default(true),
    enableVoice:       z.boolean().default(true),
    enableV2g:         z.boolean().default(false),
  }).default({}),
})

/** GET /api/v1/white-label — fetch tenant config */
export async function GET(request: NextRequest) {
  const roles = (request.headers.get('x-user-roles') ?? '').split(',')
  if (!roles.includes('admin')) return apiError('FORBIDDEN', 'Admin access required', 403)

  const tenantSlug = request.nextUrl.searchParams.get('tenant')

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const q = tenantSlug
      ? `SELECT * FROM white_label_tenants WHERE tenant_slug = $1 LIMIT 1`
      : `SELECT * FROM white_label_tenants ORDER BY created_at DESC LIMIT 50`

    const res = await db.execute(q, tenantSlug ? [tenantSlug] : [])
    return apiResponse({ tenants: res.rows })
  } catch (err) {
    console.error('[white-label GET]', err)
    return apiError('INTERNAL_ERROR', 'Could not fetch white-label config', 500)
  }
}

/** POST /api/v1/white-label — create/update white-label tenant */
export async function POST(request: NextRequest) {
  const roles = (request.headers.get('x-user-roles') ?? '').split(',')
  if (!roles.includes('admin')) return apiError('FORBIDDEN', 'Admin access required', 403)

  let body: z.infer<typeof WhiteLabelSchema>
  try { body = WhiteLabelSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid config', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'
    const tenantUrl = body.customDomain
      ? `https://${body.customDomain}`
      : `${appUrl}/t/${body.tenantSlug}`

    await db.execute(
      `INSERT INTO white_label_tenants
         (id, tenant_slug, brand_name, primary_colour, secondary_colour,
          logo_url, favicon_url, custom_domain, support_email,
          commission_rate_pct, feature_flags, tenant_url, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'active',NOW(),NOW())
       ON CONFLICT (tenant_slug) DO UPDATE SET
         brand_name = EXCLUDED.brand_name,
         primary_colour = EXCLUDED.primary_colour,
         secondary_colour = EXCLUDED.secondary_colour,
         logo_url = EXCLUDED.logo_url,
         favicon_url = EXCLUDED.favicon_url,
         custom_domain = EXCLUDED.custom_domain,
         support_email = EXCLUDED.support_email,
         commission_rate_pct = EXCLUDED.commission_rate_pct,
         feature_flags = EXCLUDED.feature_flags,
         tenant_url = EXCLUDED.tenant_url,
         updated_at = NOW()`,
      [
        crypto.randomUUID(),
        body.tenantSlug, body.brandName,
        body.primaryColour, body.secondaryColour,
        body.logoUrl ?? null, body.faviconUrl ?? null,
        body.customDomain ?? null, body.supportEmail ?? null,
        body.commissionRatePct,
        JSON.stringify(body.featureFlags),
        tenantUrl,
      ],
    )

    return apiResponse({ tenantSlug: body.tenantSlug, tenantUrl, status: 'active' }, undefined, 201)
  } catch (err) {
    console.error('[white-label POST]', err)
    return apiError('INTERNAL_ERROR', 'Could not create white-label tenant', 500)
  }
}
