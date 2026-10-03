/**
 * @file route.ts
 * @description GET /api/v1/developer/sdk — Property developer SDK info endpoint.
 * Returns SDK configuration and embed code for property developers integrating
 * Zipgrid EV charging management into new-build apartment/commercial developments.
 *
 * POST /api/v1/developer/sdk/register — Register a new developer integration.
 *
 * @module apps/web/api/v1/developer/sdk
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { apiResponse, apiError } from '@/lib/api/response'

const RegisterSchema = z.object({
  companyName:        z.string().min(2).max(200),
  contactEmail:       z.string().email(),
  developmentName:    z.string().min(2).max(200),
  numberOfBays:       z.number().int().min(1).max(10000),
  expectedOpenDate:   z.string().optional(),
  website:            z.string().url().optional(),
  integrationType:    z.enum(['embedded_portal', 'white_label', 'api_only']).default('embedded_portal'),
})

/** GET /api/v1/developer/sdk — return SDK documentation and embed snippet. */
export async function GET(_request: NextRequest) {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://zipgrid.app'

  // Return SDK documentation
  return apiResponse({
    version:    '1.0.0',
    sdkUrl:     `${appUrl}/sdk/zipgrid-ev.js`,
    docsUrl:    `${appUrl}/docs/developer-sdk`,
    supportEmail: 'developers@zipgrid.app',
    integrationTypes: [
      {
        type:        'embedded_portal',
        description: 'Embed the Zipgrid resident portal in your property app or website',
        embedSnippet: `<script src="${appUrl}/sdk/zipgrid-ev.js" data-property-id="YOUR_PROPERTY_ID"></script>
<div id="zipgrid-portal"></div>`,
      },
      {
        type:        'white_label',
        description: 'Fully white-labelled Zipgrid platform under your brand',
        setupGuide:  `${appUrl}/docs/white-label`,
      },
      {
        type:        'api_only',
        description: 'Pure REST API integration — build your own UI on Zipgrid data',
        apiDocsUrl:  `${appUrl}/docs/api`,
      },
    ],
    features: [
      'Multi-bay EV charging management',
      'Resident access control (app unlock, PIN, RFID)',
      'Revenue sharing (property / resident / split)',
      'Real-time OCPP monitoring',
      'Automated billing and invoicing',
      'Carbon reporting for ESG compliance',
      'Smart scheduling (off-peak, solar, V2G ready)',
    ],
    pricing: {
      setupFee:        'Contact us',
      monthlyPerBay:   '£5 per bay per month (after first 10 bays)',
      platformFee:     '8% commission on paid sessions',
      freeTier:        'First 10 bays free — no platform fee',
    },
  })
}

/** POST /api/v1/developer/sdk/register — register a new developer integration. */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof RegisterSchema>
  try { body = RegisterSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid input', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const sdkKey = `zg_sdk_${crypto.randomBytes(16).toString('hex')}`
    const integrationId = crypto.randomUUID()

    await db.execute(
      `INSERT INTO developer_integrations
         (id, company_name, contact_email, development_name, number_of_bays,
          expected_open_date, website, integration_type, sdk_key, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_review',NOW(),NOW())`,
      [
        integrationId,
        body.companyName,
        body.contactEmail,
        body.developmentName,
        body.numberOfBays,
        body.expectedOpenDate ?? null,
        body.website ?? null,
        body.integrationType,
        sdkKey,
      ],
    )

    return apiResponse({
      integrationId,
      sdkKey,
      status: 'pending_review',
      message: 'Your developer integration has been registered. Our team will review it within 2 business days.',
      nextSteps: [
        'Check your email for confirmation',
        'Once approved, use your SDK key to authenticate API calls',
        'Attend our onboarding call (link in your confirmation email)',
      ],
    }, undefined, 201)
  } catch (err) {
    console.error('[developer/sdk]', err)
    return apiError('INTERNAL_ERROR', 'Registration failed', 500)
  }
}
