/**
 * @file route.ts
 * @description GET  /api/v1/support/chat — the caller's latest support conversation
 *              POST /api/v1/support/chat — { message } — ask for help
 *
 * Support is answered by the concierge (ConciergeService), which knows
 * Zipgrid's policies and can look up the caller's own bookings, wallet and
 * charging. Kept as a stable endpoint for clients; /api/v1/concierge is the
 * same conversation.
 *
 * @module apps/web/api/v1/support/chat
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiResponse } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'
import { ConciergeService } from '@/domains/concierge/ConciergeService'

const MessageSchema = z.object({ message: z.string().trim().min(1).max(2000) })

/** POST /api/v1/support/chat — returns { reply, conversationId }. */
export async function POST(request: NextRequest) {
  try {
    const { userId, roles } = requireUser(request)
    const parsed = MessageSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input', 422)

    const limit = await rateLimit(`concierge:${userId}`, 30, 10 * 60)
    if (!limit.allowed) return apiError('RATE_LIMITED', "You're sending messages quickly. Try again shortly.", 429)

    const { conversationId } = await ConciergeService.latest(userId)
    const r = await ConciergeService.send({
      userId, conversationId, message: parsed.data.message, location: null, isHost: roles.includes('host'),
    })
    return apiResponse({ reply: r.reply, conversationId: r.conversationId, pendingActions: r.pendingActions })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/support/chat')
  }
}

/** GET /api/v1/support/chat — the latest conversation's messages. */
export async function GET(request: NextRequest) {
  try {
    const { userId } = requireUser(request)
    const { lines } = await ConciergeService.latest(userId)
    return apiResponse(lines.map((l) => ({ role: l.role, content: l.text })))
  } catch (err) {
    return errorResponse(err, 'GET /api/v1/support/chat')
  }
}
