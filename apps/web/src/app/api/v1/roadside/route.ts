/**
 * @file route.ts
 * @description GET /api/v1/roadside — EV roadside assistance integration.
 * Connects drivers to specialist EV roadside assistance partners (RAC, AA, Green Flag).
 * For emergency situations beyond range (e.g. completely flat battery on motorway).
 *
 * GET  — returns partner contact info and deep-link dispatch URLs
 * POST — logs a roadside assistance event (for analytics and insurance claims)
 *
 * @module apps/web/api/v1/roadside
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'

const ROADSIDE_PARTNERS = [
  {
    id:         'rac',
    name:       'RAC',
    phone:      '0800 197 3415',
    appDeepLink:'rac://breakdown',
    website:    'https://www.rac.co.uk/breakdown-cover/report-a-breakdown',
    specialisms:['EV towing', 'Mobile charging van (select areas)', 'Battery jump (12V aux)'],
    avgResponse:'38 minutes',
    coverageUk: true,
  },
  {
    id:         'aa',
    name:       'AA',
    phone:      '0800 887 766',
    appDeepLink:'aa://breakdown',
    website:    'https://www.theaa.com/breakdown-cover/report-a-breakdown',
    specialisms:['Dedicated EV patrols', 'Flatbed transport', 'Overnight hotel if needed'],
    avgResponse:'44 minutes',
    coverageUk: true,
  },
  {
    id:         'green_flag',
    name:       'Green Flag',
    phone:      '0800 051 0636',
    appDeepLink: null,
    website:    'https://www.greenflag.com/report-a-breakdown',
    specialisms:['EV towing', 'UK coverage', 'Network of local garages'],
    avgResponse:'55 minutes',
    coverageUk: true,
  },
]

/** GET /api/v1/roadside — partner directory */
export async function GET(_request: NextRequest) {
  return apiResponse({
    partners: ROADSIDE_PARTNERS,
    emergencyTips: [
      'Stay in your vehicle if on a motorway — use the nearside hard shoulder or emergency refuge area.',
      'Switch on hazard lights immediately.',
      'If your EV is completely flat, it may still have emergency power for hazard lights and interior lights.',
      'Use the Zipgrid emergency SOS to alert nearby hosts if you have any range remaining.',
      'Call 999 if you or others are in immediate danger.',
    ],
    note: 'Zipgrid is not affiliated with these providers. Contact details correct as of 2026. Always check your membership.',
  })
}

const IncidentSchema = z.object({
  incidentType: z.enum(['flat_battery', 'breakdown', 'accident', 'theft', 'vandalism', 'other']),
  location:     z.object({ lat: z.number(), lng: z.number() }).optional(),
  description:  z.string().max(1000).optional(),
  partnerId:    z.string().optional(),
})

/** POST /api/v1/roadside — log a roadside assistance event */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof IncidentSchema>
  try { body = IncidentSchema.parse(await request.json()) }
  catch { return apiError('VALIDATION_ERROR', 'Invalid incident data', 400) }

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    await db.execute(
      `INSERT INTO roadside_incidents (id, user_id, incident_type, latitude, longitude, description, partner_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        crypto.randomUUID(),
        userId,
        body.incidentType,
        body.location?.lat ?? null,
        body.location?.lng ?? null,
        body.description ?? null,
        body.partnerId ?? null,
      ],
    )

    return apiResponse({ logged: true, message: 'Incident logged. Stay safe.' }, undefined, 201)
  } catch (err) {
    console.error('[roadside POST]', err)
    return apiError('INTERNAL_ERROR', 'Could not log incident', 500)
  }
}
