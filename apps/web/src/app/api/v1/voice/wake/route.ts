/**
 * @file route.ts
 * @description POST /api/v1/voice/wake — "Hey Zipgrid" wake word event handler.
 * Called by the client after local wake word detection fires.
 * Returns a personalised greeting + AI mode for the voice session.
 *
 * @module apps/web/api/v1/voice/wake
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'

const WakeSchema = z.object({
  role:    z.enum(['driver', 'host']).default('driver'),
  context: z.record(z.string()).optional(),
})

/** POST /api/v1/voice/wake — handle wake word event */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: z.infer<typeof WakeSchema>
  try { body = WakeSchema.parse(await request.json()) }
  catch { body = { role: 'driver', context: {} } }

  try {
    // Proxy to ai-service wake word handler
    const aiUrl    = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000'
    const secret   = process.env['AI_SERVICE_SECRET'] ?? ''

    const res = await fetch(`${aiUrl}/agent/wake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': secret,
        'X-User-Id': userId,
      },
      body: JSON.stringify({ role: body.role, context: body.context ?? {}, user_id: userId }),
      signal: AbortSignal.timeout(3_000),
    })

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>
      return apiResponse(data)
    }

    // Fallback greeting if ai-service unavailable
    return apiResponse({
      greeting:  "Hi, I'm Zipgrid. How can I help?",
      mode:      'hybrid',
      listening: true,
    })
  } catch {
    return apiResponse({
      greeting:  "Hey! I'm listening.",
      mode:      'hybrid',
      listening: true,
    })
  }
}
