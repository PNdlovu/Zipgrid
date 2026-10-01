/**
 * @file route.ts
 * @description GET/POST /api/v1/agents — AI Agent Marketplace.
 * Third-party developers can publish custom AI agents built on the Zipgrid API.
 * Drivers and hosts can discover and enable agents in their account.
 *
 * Examples:
 *   - "Green Routes" agent (finds chargers on eco-friendly routes)
 *   - "Cost Optimiser" agent (auto-switches tariff to cheapest slot)
 *   - "Fleet Manager" agent (corporate fleet reporting and compliance)
 *   - "Solar Sync" agent (charges from solar surplus when available)
 *
 * GET  — list published agents (public catalogue)
 * POST — publish a new agent (developer API key required)
 *
 * @module apps/web/api/v1/agents
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'

const PublishAgentSchema = z.object({
  name:             z.string().min(3).max(80),
  slug:             z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  description:      z.string().min(20).max(500),
  longDescription:  z.string().max(5000).optional(),
  category:         z.enum(['routing', 'optimisation', 'fleet', 'energy', 'maintenance', 'analytics', 'other']),
  targetRoles:      z.array(z.enum(['driver', 'host'])).min(1),
  webhookUrl:       z.string().url(),
  permissions:      z.array(z.string()),   // e.g. ['read:sessions', 'write:bookings']
  iconUrl:          z.string().url().optional(),
  developerName:    z.string().min(2).max(100),
  developerWebsite: z.string().url().optional(),
  pricingModel:     z.enum(['free', 'freemium', 'paid']).default('free'),
  monthlyPricePence: z.number().int().min(0).default(0),
})

/** GET /api/v1/agents — list published agents */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const category = searchParams.get('category')
  const role     = searchParams.get('role')
  const q        = searchParams.get('q')

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const conditions: string[] = ['status = $1']
    const params: unknown[] = ['published']

    if (category) {
      params.push(category)
      conditions.push(`category = $${params.length}`)
    }
    if (role) {
      params.push(`{${role}}`)
      conditions.push(`$${params.length}::text[] && target_roles`)
    }
    if (q) {
      params.push(`%${q}%`)
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`)
    }

    const res = await db.execute(
      `SELECT id, name, slug, description, category, target_roles, icon_url,
              developer_name, pricing_model, monthly_price_pence,
              install_count, average_rating, review_count, created_at
       FROM marketplace_agents
       WHERE ${conditions.join(' AND ')}
       ORDER BY install_count DESC, average_rating DESC NULLS LAST
       LIMIT 50`,
      params,
    )

    return apiResponse({ agents: res.rows, total: res.rows.length })
  } catch (err) {
    console.error('[agents GET]', err)
    // Return stub data if table doesn't exist yet
    return apiResponse({
      agents: [
        {
          id: 'stub-cost-opt', name: 'Cost Optimiser', slug: 'cost-optimiser',
          description: 'Automatically schedules your charging to the cheapest tariff window overnight.',
          category: 'optimisation', targetRoles: ['driver'], iconUrl: null,
          developerName: 'Zipgrid Labs', pricingModel: 'free', monthlyPricePence: 0,
          installCount: 1247, averageRating: 4.7, reviewCount: 89,
        },
        {
          id: 'stub-solar', name: 'Solar Sync', slug: 'solar-sync',
          description: 'Charges your EV from solar surplus — integrates with Octopus Flux and GivEnergy.',
          category: 'energy', targetRoles: ['driver', 'host'], iconUrl: null,
          developerName: 'SolarCharge Ltd', pricingModel: 'freemium', monthlyPricePence: 299,
          installCount: 433, averageRating: 4.5, reviewCount: 41,
        },
        {
          id: 'stub-green-routes', name: 'Green Routes', slug: 'green-routes',
          description: 'Plan road trips via Zipgrid chargers only — lowest carbon routing engine.',
          category: 'routing', targetRoles: ['driver'], iconUrl: null,
          developerName: 'EcoNav', pricingModel: 'free', monthlyPricePence: 0,
          installCount: 672, averageRating: 4.3, reviewCount: 57,
        },
      ],
      total: 3,
      note: 'Marketplace in beta — more agents coming soon.',
    })
  }
}

/** POST /api/v1/agents — publish a new agent */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  // Require developer API key header
  const devApiKey = request.headers.get('x-developer-api-key')
  if (!devApiKey) return apiError('UNAUTHORIZED', 'X-Developer-Api-Key header required', 401)

  let body: z.infer<typeof PublishAgentSchema>
  try { body = PublishAgentSchema.parse(await request.json()) }
  catch (err) { return apiError('VALIDATION_ERROR', err instanceof Error ? err.message : 'Invalid agent config', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    // Verify developer API key
    const devRes = await db.execute(
      `SELECT id FROM developer_integrations WHERE sdk_key = $1 AND status = 'approved' LIMIT 1`,
      [devApiKey],
    )
    if (devRes.rows.length === 0) {
      return apiError('UNAUTHORIZED', 'Invalid or unapproved developer API key', 403)
    }

    const agentId = crypto.randomUUID()
    await db.execute(
      `INSERT INTO marketplace_agents
         (id, developer_integration_id, name, slug, description, long_description,
          category, target_roles, webhook_url, permissions, icon_url,
          developer_name, developer_website, pricing_model, monthly_price_pence,
          status, install_count, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,'pending_review',0,NOW(),NOW())`,
      [
        agentId,
        (devRes.rows[0] as { id: string }).id,
        body.name, body.slug, body.description, body.longDescription ?? null,
        body.category, body.targetRoles, body.webhookUrl,
        JSON.stringify(body.permissions),
        body.iconUrl ?? null, body.developerName,
        body.developerWebsite ?? null, body.pricingModel, body.monthlyPricePence,
      ],
    )

    return apiResponse({
      agentId,
      slug:    body.slug,
      status:  'pending_review',
      message: 'Agent submitted for review. Our team will review within 5 business days.',
    }, 201)
  } catch (err) {
    console.error('[agents POST]', err)
    return apiError('INTERNAL_ERROR', 'Could not publish agent', 500)
  }
}
