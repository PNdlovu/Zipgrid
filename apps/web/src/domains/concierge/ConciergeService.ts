/**
 * @file ConciergeService.ts
 * @description The AI charging concierge: "get me charged" in plain words.
 * Claude finds chargers, reads their trust report, quotes, and books, cancels
 * or stops charging once the user confirms (see tools.ts).
 *
 *   - History lives server-side (concierge_conversations), append-only and
 *     including thinking blocks, so clients can't forge tool results.
 *   - Each user message is one turn; side effects need a later turn's yes.
 *   - The system prompt and tool list are fixed and cached; per-message
 *     context (time, shared location) rides in the user message.
 *   - Server-side fallbacks retry a declined request on another Claude model.
 *
 * Requires ANTHROPIC_API_KEY.
 *
 * @module domains/concierge
 */

import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { AppError, NotFoundError, ServiceUnavailableError } from '@/lib/errors/AppError'
import { TOOL_DEFINITIONS, runTool, type ToolContext } from './tools'

export const CONCIERGE_MODEL = 'claude-opus-5-5'
/** Tool-call rounds per user message before the agent must answer. */
const MAX_ROUNDS = 8
/** A conversation this long starts afresh (keeps cost and latency bounded). */
const MAX_TURNS = 40

type Msg = Anthropic.Beta.BetaMessageParam

export type ConciergeReply = {
  conversationId: string
  reply: string
  /** Actions the agent prepared this turn, for the UI to show as confirm cards. */
  pendingActions: { actionId: string; summary: string }[]
  /** Bookings made / cancelled / sessions stopped this turn. */
  completedActions: { kind: string; summary: string }[]
}

export type ChatLine = { role: 'user' | 'assistant'; text: string }

const SYSTEM_PROMPT = `You are Zipgrid's charging concierge. Zipgrid is a UK marketplace where homeowners, businesses and residential buildings rent out their EV chargers by the hour. Drivers tell you what they need in plain words ("get me charged near Leeds tomorrow morning", "I'm driving to Manchester on Friday") and you handle it: find suitable chargers, check they can be trusted, price the booking, and book it once the driver says yes.

How to work:
- Work out what the driver needs (where, when, how long, which car) from what they said. Ask one short question only when something essential is missing; otherwise make sensible assumptions and state them (e.g. a 2-hour slot, their only car).
- Before recommending a charger, read its details with get_charger_details and weigh the trust report: rating and review comments, host cancellations, incidents, lighting and access. Mention anything a driver would want to know (e.g. "reviews say the bay is hard to find after dark"). Prefer reliable, well-reviewed hosts over a slightly cheaper or nearer one.
- Recommend one best option, and give one backup when there is a real alternative.
- Money and bookings: never claim something is booked, cancelled or stopped unless confirm_action returned success. To book, call quote_booking and show the user its summary and price, then wait for their reply. Only call confirm_action when the user's latest message clearly agrees to that exact action. If they change anything, quote again.
- After booking, give what they need on arrival: address, access instructions and arrival code when the booking is confirmed, or that the host must approve it.
- If a tool returns an error, explain it plainly and offer the next step (another time, another charger, topping up the wallet).
- Times are UK local time. Write ISO times with the correct offset (+01:00 in British Summer Time, +00:00 otherwise).

Style: the driver may be listening by voice or glancing at a watch, so be brief and conversational. Lead with the answer. Plain English, no jargon, no markdown tables. Prices in pounds. You only help with EV charging on Zipgrid; politely decline anything else.`

let client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!process.env['ANTHROPIC_API_KEY']) throw new ServiceUnavailableError('Concierge')
  client ??= new Anthropic()
  return client
}

/** True when the concierge can run (an API key is configured). */
export function conciergeConfigured(): boolean {
  return Boolean(process.env['ANTHROPIC_API_KEY'])
}

function contextNote(location: ToolContext['location']): string {
  const now = new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return `[Context: it is ${now} UK time.${location ? ` The user shared their location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}.` : ''}]`
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
}

async function loadConversation(userId: string, conversationId: string | null) {
  const db = await getDb()
  if (conversationId) {
    const res = await db.execute(
      `SELECT id, messages, turn FROM concierge_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    )
    const row = res.rows[0]
    if (!row) throw new NotFoundError('Conversation', conversationId)
    if (Number(row['turn']) < MAX_TURNS) {
      const messages = (typeof row['messages'] === 'string' ? JSON.parse(row['messages']) : row['messages']) as Msg[]
      return { id: row['id'] as string, messages, turn: Number(row['turn']) }
    }
  }
  const res = await db.execute(`INSERT INTO concierge_conversations (user_id) VALUES ($1) RETURNING id`, [userId])
  return { id: res.rows[0]!['id'] as string, messages: [] as Msg[], turn: 0 }
}

/** Calls Claude once with the conversation so far. */
async function callClaude(api: Anthropic, messages: Msg[], allowTools: boolean): Promise<Anthropic.Beta.BetaMessage> {
  try {
    return await api.beta.messages.create({
      model: CONCIERGE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      // Tools stay declared on the last round (keeps the cache) but can't be called.
      ...(allowTools ? {} : { tool_choice: { type: 'none' as const } }),
      messages,
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
      throw new AppError('The concierge is busy right now. Please try again in a moment.', 'CONCIERGE_BUSY', 503)
    }
    throw err
  }
}

export const ConciergeService = {
  /** Sends the user's message, runs the agent loop, stores the turn and returns the reply. */
  async send(input: {
    userId: string
    conversationId: string | null
    message: string
    location: { lat: number; lng: number } | null
  }): Promise<ConciergeReply> {
    const api = anthropic()
    const convo = await loadConversation(input.userId, input.conversationId)
    const turn = convo.turn + 1
    const ctx: ToolContext = { userId: input.userId, conversationId: convo.id, turn, location: input.location }

    // This turn's messages, appended to the stored history once it ends.
    const added: Msg[] = [{
      role: 'user',
      content: [{ type: 'text', text: `${contextNote(input.location)}\n\n${input.message}` }],
    }]
    const pendingActions: ConciergeReply['pendingActions'] = []
    const completedActions: ConciergeReply['completedActions'] = []
    const save = async () => {
      const db = await getDb()
      await db.execute(
        `UPDATE concierge_conversations SET messages = messages || $2::jsonb, turn = $3, updated_at = NOW() WHERE id = $1`,
        [convo.id, JSON.stringify(added), turn],
      )
    }

    let reply: string | null = null
    try {
      for (let round = 0; reply === null; round++) {
        const response = await callClaude(api, [...convo.messages, ...added], round < MAX_ROUNDS)
        if (response.stop_reason === 'refusal') {
          // The declined response is dropped; earlier rounds of this turn are kept.
          reply = "Sorry, I can't help with that. I can find, book and manage EV charging for you."
          break
        }
        added.push({ role: 'assistant', content: response.content })
        const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
        if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
          reply = textOf(response.content) || "Sorry, I didn't manage to finish that. Could you say it another way?"
          break
        }

        // Independent calls run in parallel; all results go back in one message.
        const results = await Promise.all(toolUses.map(async (t) => {
          const r = await runTool(t.name, t.input, ctx)
          if (!r.isError && (t.name === 'quote_booking' || t.name.startsWith('propose_'))) {
            const out = JSON.parse(r.content) as { actionId: string; summary: string }
            pendingActions.push({ actionId: out.actionId, summary: out.summary })
          }
          if (!r.isError && t.name === 'confirm_action') {
            const out = JSON.parse(r.content) as Record<string, unknown>
            completedActions.push(
              out['booked'] ? { kind: 'booked', summary: `Booked ${String(out['charger'] ?? '')}`.trim() }
                : out['cancelled'] ? { kind: 'cancelled', summary: 'Booking cancelled' }
                  : { kind: 'stopping', summary: 'Stopping charging' },
            )
          }
          return { type: 'tool_result' as const, tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) }
        }))
        added.push({ role: 'user', content: results })
      }
    } catch (err) {
      // Keep tool work already done (a booking may have been made) so the next
      // message continues from it. The history stays valid: it ends with tool
      // results, which the next user message follows.
      if (added.length > 1) await save().catch(() => undefined)
      throw err
    }

    // A turn declined outright (nothing but the user's message) isn't stored.
    if (added.length > 1) await save()
    return { conversationId: convo.id, reply, pendingActions, completedActions }
  },

  /** The user's latest conversation as plain chat lines (tool traffic and context notes removed). */
  async latest(userId: string): Promise<{ conversationId: string | null; lines: ChatLine[] }> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT id, messages, turn FROM concierge_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [userId],
    )
    const row = res.rows[0]
    if (!row || Number(row['turn']) >= MAX_TURNS) return { conversationId: null, lines: [] }
    const messages = (typeof row['messages'] === 'string' ? JSON.parse(row['messages']) : row['messages']) as Msg[]
    const lines: ChatLine[] = []
    for (const m of messages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue
      const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
      const text = (blocks as { type: string; text?: string }[])
        .filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
        .replace(/^\[Context:[^\]]*\]\s*/, '').trim()
      if (text) lines.push({ role: m.role, text })
    }
    return { conversationId: row['id'] as string, lines }
  },
}
