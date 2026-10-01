/**
 * @file route.ts
 * @description POST /api/v1/support/chat — AI-powered support chat.
 * Proxies to the ai-service for an agentic response, with conversation
 * history stored per-user in the AI service's Redis memory.
 *
 * Also handles GET for chat history from the notifications/support table.
 *
 * @module apps/web/api/v1/support/chat
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiResponse, apiError } from '@/lib/api/response'
import { AppError } from '@/lib/errors/AppError'
import { v4 as uuidv4 } from 'uuid'

const MessageSchema = z.object({
  message: z.string().min(1).max(2000),
  /** Optional page context to enrich AI response */
  context: z.object({
    sessionId:  z.string().uuid().optional(),
    bookingId:  z.string().uuid().optional(),
    listingId:  z.string().uuid().optional(),
    pageHint:   z.string().max(64).optional(),
  }).optional(),
})

function getAiServiceUrl(): string {
  return process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000'
}

function getAiServiceSecret(): string {
  return process.env['AI_SERVICE_SECRET'] ?? 'dev-ai-secret'
}

/**
 * POST /api/v1/support/chat
 * Sends a message to the AI support agent and returns the response.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const roles = (request.headers.get('x-user-roles') ?? '').split(',')
  const role = roles.includes('host') ? 'host' : 'driver'

  let body: unknown
  try { body = await request.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const parsed = MessageSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid input', 422)
  }

  const { message, context } = parsed.data

  try {
    // Persist the user message to support_messages table (best-effort)
    const conversationId = await getOrCreateConversation(userId)
    await persistMessage(conversationId, 'user', message)

    // Call AI service
    const aiRes = await fetch(`${getAiServiceUrl()}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': getAiServiceSecret(),
      },
      body: JSON.stringify({
        user_id: userId,
        role,
        ai_mode: 'hybrid',
        message,
        context: context ?? {},
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!aiRes.ok) {
      // Fallback response if AI service is down
      const fallback = "I'm having trouble connecting right now. Please try again in a moment, or email support@zipgrid.app."
      await persistMessage(conversationId, 'assistant', fallback)
      return apiResponse({ reply: fallback, conversationId })
    }

    const aiData = (await aiRes.json()) as { response: string }
    const reply = aiData.response ?? "I couldn't generate a response. Please try again."

    await persistMessage(conversationId, 'assistant', reply)

    return apiResponse({ reply, conversationId })
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    // Graceful degradation — support chat should never hard-fail
    return apiResponse({
      reply: "I'm experiencing a temporary issue. Please try again shortly or email support@zipgrid.app.",
      conversationId: null,
    })
  }
}

/**
 * GET /api/v1/support/chat — returns the last 50 messages for the current user's conversation.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()

    const res = await db.execute(
      `SELECT sm.id, sm.role, sm.content, sm.created_at
       FROM support_messages sm
       JOIN support_conversations sc ON sc.id = sm.conversation_id
       WHERE sc.user_id = $1
       ORDER BY sm.created_at DESC
       LIMIT 50`,
      [userId],
    )

    return apiResponse(
      res.rows
        .map((r) => {
          const row = r as Record<string, unknown>
          return {
            id: row['id'],
            role: row['role'],
            content: row['content'],
            createdAt: row['created_at'],
          }
        })
        .reverse(),
    )
  } catch (err) {
    if (err instanceof AppError) return apiError(err.code, err.message, err.statusCode)
    return apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
  }
}

/* ── Helpers ────────────────────────────────────────────────── */

async function getOrCreateConversation(userId: string): Promise<string> {
  const { getDb } = await import('@/lib/db')
  const db = await getDb()

  // Find open conversation for today
  const existing = await db.execute(
    `SELECT id FROM support_conversations
     WHERE user_id = $1 AND status = 'open'
       AND created_at >= NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  if (existing.rows.length > 0) {
    return (existing.rows[0] as { id: string }).id
  }

  const id = uuidv4()
  await db.execute(
    `INSERT INTO support_conversations (id, user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'open', NOW(), NOW())`,
    [id, userId],
  )
  return id
}

async function persistMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  try {
    const { getDb } = await import('@/lib/db')
    const db = await getDb()
    await db.execute(
      `INSERT INTO support_messages (id, conversation_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), conversationId, role, content],
    )
  } catch {
    // Best-effort persistence
  }
}
