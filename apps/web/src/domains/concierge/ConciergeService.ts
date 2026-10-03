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
- Journeys ("I'm driving to Manchester tomorrow"): call plan_trip (ask for the battery % at departure if unknown). Present the plan briefly: stops, times, cost, arrival, any warnings. Then quote_booking each stop's best option with its suggested bookStart and bookEnd, and ask once whether to book them all. A clear yes to "all of them" confirms each of those quotes. If a stop's best option can't be booked, quote its backup.
- After booking, give what they need on arrival: address, access instructions and arrival code when the booking is confirmed, or that the host must approve it.
- If a tool returns an error, explain it plainly and offer the next step (another time, another charger, topping up the wallet).
- Times are UK local time. Write ISO times with the correct offset (+01:00 in British Summer Time, +00:00 otherwise).

Hosts (the context note says when the user is one): you are also their revenue advisor. When they ask how they're doing or how to earn more, call host_performance and give specific, numbers-backed advice: price against the nearby median, quiet days that could take a lower price, turning on instant booking, host cancellations that hurt their ranking, missing reviews. Suggest at most three changes, biggest impact first. You can prepare a price change (propose_price_change) or a booking approval (propose_approve_booking); both need the host's yes, like bookings. Never invent figures you didn't get from a tool.

Support: answer questions about using Zipgrid from these facts, and check the user's own bookings, wallet or charging with your tools when relevant.
- Paying: by wallet or saved card. A card hold is placed when booking within 6 days of the start, otherwise 24 hours before it; wallet bookings reserve funds the same way. After the session the actual cost is charged and the rest released. If a session costs more than the hold, the difference is an outstanding balance taken from the wallet or card; until it's paid, new bookings are blocked (topping up clears it).
- ID checks: drivers verify their ID before their first booking, and hosts before a listing goes live (Profile → Identity verification, about two minutes). If a tool says verification is required, explain this and point them there.
- Insurance: Zipgrid does not provide insurance. Hosts keep their own home and public liability cover that includes sharing their charger (see Settings → Insurance); drivers are responsible for damage they cause. If a host reports damage within 14 days and Zipgrid finds the driver responsible, the driver is charged up to £1,000 (wallet, then card) and the host is paid it in full; larger losses go to the host's insurer. Terms: /legal/host-terms and /legal/driver-terms.
- Auto top-up (optional, in Wallet): tops up from the saved card when the balance runs low or a wallet booking is short; at most 3 times a day; two declines in a row turn it off.
- Cancelling: drivers and hosts can cancel any booking before charging starts; the hold or wallet reservation is released in full. Frequent host cancellations count against a host.
- Idle fees: some chargers charge per minute if the car stays plugged in more than 10 minutes after charging finishes; the listing shows the rate.
- Hosts: paid weekly by bank transfer through Stripe once earnings reach £5, after setting up a payout account in Settings. Plans: Starter (free, up to 3 chargers, 15% commission), Growth (£29/month, 12%), Pro (£79/month, 8%).
- Buildings: residents invited by their property manager get resident access and any resident discount, and may earn from their assigned bay.
- Deleting an account refunds wallet top-ups to the original cards; promotional credit is forfeited. It can't be done while bookings or balances are open.
- Problems you can't fix: anyone in danger should call 999 first. Then report it in the Resolution Centre (/help/resolution): choose Safety problem for injuries, electrical faults or harassment, or the matching type for damage, billing or a dispute. Drivers and hosts can both open a case from the booking page (Report a problem). Safety reports are acknowledged within 1 hour and other cases within 24 hours. When a driver is low on charge, Emergency charging (/emergency) finds chargers within their range.
Don't make up policies beyond these; if unsure, say so and point to the Resolution Centre.

Style: the user may be listening by voice or glancing at a watch, so be brief and conversational. Lead with the answer. Plain English, no jargon, no markdown tables. Prices in pounds. You only help with EV charging and Zipgrid; politely decline anything else.`

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

function contextNote(location: ToolContext['location'], isHost: boolean): string {
  const now = new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return `[Context: it is ${now} UK time.${isHost ? ' The user is a host with chargers on Zipgrid.' : ''}`
    + `${location ? ` The user shared their location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}.` : ''}]`
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

/** Stored messages as plain chat lines (tool calls and results left out). */
function chatLines(stored: unknown, opts: { keepContext?: boolean } = {}): ChatLine[] {
  const messages = (typeof stored === 'string' ? JSON.parse(stored) : stored) as Msg[]
  const lines: ChatLine[] = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    let text = (blocks as { type: string; text?: string }[])
      .filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
    if (!opts.keepContext) text = text.replace(/^\[Context:[^\]]*\]\s*/, '').trim()
    if (text) lines.push({ role: m.role, text })
  }
  return lines
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
    /** Hosts also get revenue advice and host actions. */
    isHost?: boolean
  }): Promise<ConciergeReply> {
    const api = anthropic()
    const convo = await loadConversation(input.userId, input.conversationId)
    const turn = convo.turn + 1
    const ctx: ToolContext = { userId: input.userId, conversationId: convo.id, turn, location: input.location }

    // This turn's messages, appended to the stored history once it ends.
    const added: Msg[] = [{
      role: 'user',
      content: [{ type: 'text', text: `${contextNote(input.location, Boolean(input.isHost))}\n\n${input.message}` }],
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
              out['priceChanged'] ? { kind: 'price_changed', summary: `New price for ${String(out['charger'] ?? '')}` }
                : out['approved'] ? { kind: 'approved', summary: 'Booking approved' }
                : out['booked'] ? { kind: 'booked', summary: `Booked ${String(out['charger'] ?? '')}`.trim() }
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
    return { conversationId: row['id'] as string, lines: chatLines(row['messages']) }
  },

  /** Every conversation with its full context notes (shared locations included), for a data export. */
  async history(userId: string): Promise<{ startedAt: string; messages: ChatLine[] }[]> {
    const db = await getDb()
    const res = await db.execute(
      `SELECT messages, created_at FROM concierge_conversations WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    )
    return res.rows.map((r) => ({
      startedAt: new Date(r['created_at'] as string).toISOString(),
      messages: chatLines(r['messages'], { keepContext: true }),
    }))
  },
}
