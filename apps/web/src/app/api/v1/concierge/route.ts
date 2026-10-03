/**
 * @file route.ts
 * @description GET  /api/v1/concierge — the caller's latest concierge conversation
 *              POST /api/v1/concierge — { message, conversationId?, location? } — talk to the concierge
 *
 * Rate limited per user (each message runs a Claude agent turn).
 *
 * @module apps/web/api/v1/concierge
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'
import { ConciergeService } from '@/domains/concierge/ConciergeService'

const MessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().uuid().nullish(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullish(),
})

/** GET /api/v1/concierge — latest conversation as chat lines. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    return apiResponse(await ConciergeService.latest(userId))
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/concierge')
  }
}

/** POST /api/v1/concierge — send a message, get the concierge's reply. */
export async function POST(request: NextRequest) {
  try {
    const { userId, roles } = requireUser(request)
    const parsed = MessageSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request', 422)

    const limit = await rateLimit(`concierge:${userId}`, 30, 10 * 60)
    if (!limit.allowed) {
      return apiError('RATE_LIMITED', `You're sending messages quickly. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`, 429)
    }

    return apiResponse(await ConciergeService.send({
      userId,
      conversationId: parsed.data.conversationId ?? null,
      message: parsed.data.message,
      location: parsed.data.location ?? null,
      isHost: roles.includes('host'),
    }))
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/concierge')
  }
}
