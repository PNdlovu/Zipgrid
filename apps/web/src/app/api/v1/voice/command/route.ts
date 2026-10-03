/**
 * @file route.ts
 * @description POST /api/v1/voice/command — a spoken request, answered by the
 * concierge (ConciergeService). Continues the caller's latest conversation, so
 * "yes, book it" works as a follow-up.
 *
 * Response shape (kept for VoiceButton):
 *   { intent, confidence, speech, action, params, requiresConfirmation }
 *
 * @module apps/web/api/v1/voice/command
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { errorResponse, requireUser } from '@/lib/api/context'
import { rateLimit } from '@/lib/rate-limit'
import { ConciergeService } from '@/domains/concierge/ConciergeService'

const VoiceCommandSchema = z.object({
  /** Plain-text transcript from the Web Speech API or Whisper */
  transcript: z.string().trim().min(1).max(2000),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullish(),
})

export type VoiceAction =
  | { type: 'navigate'; url: string }
  | { type: 'speak_only' }

export type VoiceCommandResponse = {
  intent: 'concierge'
  confidence: number
  /** What the client should say back */
  speech: string
  action: VoiceAction
  params: { conversationId: string; pendingActions: { actionId: string; summary: string }[] }
  /** True when the concierge prepared something that needs a spoken "yes" */
  requiresConfirmation: boolean
}

/** POST /api/v1/voice/command */
export async function POST(request: NextRequest) {
  try {
    const { userId, roles } = requireUser(request)
    const parsed = VoiceCommandSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input', 422)

    const limit = await rateLimit(`concierge:${userId}`, 30, 10 * 60)
    if (!limit.allowed) return apiError('RATE_LIMITED', "You're sending requests quickly. Try again shortly.", 429)

    const { conversationId } = await ConciergeService.latest(userId)
    const r = await ConciergeService.send({
      userId, conversationId, message: parsed.data.transcript, location: parsed.data.location ?? null, isHost: roles.includes('host'),
    })
    const booked = r.completedActions.some((a) => a.kind === 'booked' || a.kind === 'cancelled')
    return apiResponse<VoiceCommandResponse>({
      intent: 'concierge',
      confidence: 1,
      speech: r.reply,
      action: booked ? { type: 'navigate', url: '/bookings' } : { type: 'speak_only' },
      params: { conversationId: r.conversationId, pendingActions: r.pendingActions },
      requiresConfirmation: r.pendingActions.length > 0,
    })
  } catch (err) {
    return errorResponse(err, 'POST /api/v1/voice/command')
  }
}
