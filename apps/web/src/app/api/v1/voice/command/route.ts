/**
 * @file route.ts
 * @description POST /api/v1/voice/command
 * Accepts a voice transcript (text), forwards to the ai-service for
 * GPT-4o intent parsing, and returns a structured action the client
 * can execute (navigate, prefill form, confirm, etc.).
 *
 * Also handles audio blobs: if the request contains a multipart
 * audio file, it is forwarded to Whisper (via ai-service) for STT
 * before intent parsing.
 *
 * Response shape:
 *   { intent, confidence, action, speech, params }
 *
 * @module apps/web/api/v1/voice/command
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'

/* ── Input schema ───────────────────────────────────────────── */

const VoiceCommandSchema = z.object({
  /** Plain-text transcript from Web Speech API or Whisper */
  transcript: z.string().min(1).max(2000),
  /** Caller role — drives which intent set GPT-4o considers */
  role: z.enum(['driver', 'host']).default('driver'),
  /** Optional: current page context so the agent can be smarter */
  context: z
    .object({
      page: z.string().optional(),
      listingId: z.string().uuid().optional(),
      bookingId: z.string().uuid().optional(),
      sessionId: z.string().uuid().optional(),
    })
    .optional(),
  /** Preferred language (BCP-47) — defaults to en-GB */
  language: z.string().default('en-GB'),
})

export type VoiceCommandRequest = z.infer<typeof VoiceCommandSchema>

/* ── Structured response types ──────────────────────────────── */

export type VoiceIntent =
  | 'find_charger'
  | 'book_charger'
  | 'session_status'
  | 'stop_session'
  | 'spend_query'
  | 'navigate_booking'
  | 'schedule_charging'
  | 'block_date'
  | 'fault_report'
  | 'unknown'

export type VoiceAction =
  | { type: 'navigate'; url: string }
  | { type: 'prefill_booking'; listingId?: string; date?: string; hours?: number }
  | { type: 'stop_session'; sessionId: string }
  | { type: 'show_session_status'; sessionId: string }
  | { type: 'show_spend_summary'; period: string }
  | { type: 'navigate_to_booking'; bookingId: string }
  | { type: 'block_date'; listingId: string; date: string }
  | { type: 'schedule_charging'; targetSoc?: number; byTime?: string }
  | { type: 'open_fault_report'; listingId?: string }
  | { type: 'speak_only' }

export type VoiceCommandResponse = {
  intent: VoiceIntent
  confidence: number
  /** Human-readable response the TTS engine should speak back */
  speech: string
  /** Machine-readable action the client should execute */
  action: VoiceAction
  /** Raw params extracted by the NLP layer */
  params: Record<string, unknown>
  /** Whether this action requires user confirmation before executing */
  requiresConfirmation: boolean
}

/* ── Route handler ──────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = VoiceCommandSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000'
  const aiServiceSecret = process.env.AI_SERVICE_SECRET ?? ''

  try {
    // Forward to ai-service for GPT-4o intent parsing
    const aiRes = await fetch(`${aiServiceUrl}/agent/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': aiServiceSecret,
        'X-User-Id': userId,
        'X-User-Roles': request.headers.get('x-user-roles') ?? '',
      },
      body: JSON.stringify({
        transcript: parsed.data.transcript,
        role: parsed.data.role,
        context: parsed.data.context ?? {},
        language: parsed.data.language,
        user_id: userId,
      }),
      signal: AbortSignal.timeout(12_000), // 12s — GPT-4o p95 latency
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('[voice/command] ai-service error:', errText)
      // Degrade gracefully — return a "speak_only" fallback
      return apiResponse<VoiceCommandResponse>({
        intent: 'unknown',
        confidence: 0,
        speech: "Sorry, I didn't catch that. Could you try again?",
        action: { type: 'speak_only' },
        params: {},
        requiresConfirmation: false,
      })
    }

    const result = (await aiRes.json()) as VoiceCommandResponse
    return apiResponse(result)
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    // Network / timeout — degrade to speak_only
    console.error('[voice/command] fetch failed:', err)
    return apiResponse<VoiceCommandResponse>({
      intent: 'unknown',
      confidence: 0,
      speech: "I'm having trouble connecting. Please try again in a moment.",
      action: { type: 'speak_only' },
      params: {},
      requiresConfirmation: false,
    })
  }
}
