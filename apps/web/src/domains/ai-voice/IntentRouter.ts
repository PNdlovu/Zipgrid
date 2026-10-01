/**
 * @file IntentRouter.ts
 * @description Voice intent router — maps a transcribed utterance to a structured
 * intent, then dispatches to the AI service or directly to a domain action.
 *
 * Intents:
 *   find_charger      — "find a charger near me" / "search for chargers"
 *   start_session     — "start charging" / "begin session"
 *   stop_session      — "stop charging" / "end session"
 *   get_session_status — "how's my session" / "how much energy"
 *   get_balance       — "what's my wallet balance"
 *   get_earnings      — "how much have I earned"
 *   navigate_to       — "take me to wallet" / "open bookings"
 *   help              — "help" / "what can you do"
 *   cancel            — "cancel" / "never mind"
 *
 * Fast-path intents (navigate_to, cancel) are handled locally.
 * All others are forwarded to the AI service chat endpoint.
 *
 * @module domains/ai-voice
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/* ── Types ─────────────────────────────────────────────────── */

export type IntentName =
  | 'find_charger'
  | 'start_session'
  | 'stop_session'
  | 'get_session_status'
  | 'get_balance'
  | 'get_earnings'
  | 'navigate_to'
  | 'help'
  | 'cancel'
  | 'unknown'

export type ParsedIntent = {
  name: IntentName
  confidence: 'high' | 'medium' | 'low'
  /** Extracted entities from the utterance */
  entities: {
    location?: string
    sessionId?: string
    destination?: string
    amount?: number
  }
  originalTranscript: string
}

export type IntentAction =
  | { type: 'navigate'; path: string }
  | { type: 'ai_chat'; message: string }
  | { type: 'speak'; text: string }
  | { type: 'noop' }

/* ── Intent patterns ───────────────────────────────────────── */

type IntentPattern = {
  name: IntentName
  patterns: RegExp[]
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    name: 'find_charger',
    patterns: [
      /\b(find|search|look\s+for|show|where)\b.*\bcharger/i,
      /\bchargers?\b.*\b(near|nearby|close|around)/i,
      /\b(map|nearby|near\s+me)\b/i,
    ],
  },
  {
    name: 'start_session',
    patterns: [
      /\b(start|begin|kick\s+off)\b.*\b(charging|session)/i,
      /\bcharge\s+my\s+(car|ev|vehicle|battery)/i,
      /\bplug\s+in\b/i,
    ],
  },
  {
    name: 'stop_session',
    patterns: [
      /\b(stop|end|finish|cancel)\b.*\b(charging|session)/i,
      /\bstop\s+charging\b/i,
    ],
  },
  {
    name: 'get_session_status',
    patterns: [
      /\bhow\s+(is|'?s)\s+(my|the)\s+(session|charging|charge)\b/i,
      /\bhow\s+much\s+(energy|power|electricity|kwh)\b/i,
      /\bsession\s+status\b/i,
      /\bcharging\s+status\b/i,
    ],
  },
  {
    name: 'get_balance',
    patterns: [
      /\bwallet\s+balance\b/i,
      /\bhow\s+much\s+(is\s+in\s+my\s+wallet|do\s+i\s+have)\b/i,
      /\bmy\s+balance\b/i,
      /\bwhat'?s\s+(in\s+my\s+wallet|my\s+balance)\b/i,
    ],
  },
  {
    name: 'get_earnings',
    patterns: [
      /\b(earnings|revenue|income)\b/i,
      /\bhow\s+much\s+(have\s+i\s+earned|did\s+i\s+make)\b/i,
      /\bmy\s+earnings\b/i,
    ],
  },
  {
    name: 'navigate_to',
    patterns: [
      /\b(go\s+to|open|show\s+me|take\s+me\s+to)\b/i,
    ],
  },
  {
    name: 'help',
    patterns: [
      /^\s*help\s*$/i,
      /\bwhat\s+can\s+you\s+do\b/i,
      /\bwhat\s+commands?\b/i,
    ],
  },
  {
    name: 'cancel',
    patterns: [
      /^\s*(cancel|never\s*mind|stop\s*listening|quit|exit|close)\s*$/i,
    ],
  },
]

/* ── Navigation destination map ───────────────────────────── */

const NAV_DESTINATIONS: Array<{ patterns: RegExp[]; path: string }> = [
  { patterns: [/wallet/i, /balance/i],          path: '/wallet' },
  { patterns: [/booking/i],                      path: '/bookings' },
  { patterns: [/reward/i, /badge/i, /point/i],   path: '/rewards' },
  { patterns: [/map/i, /charger/i, /near/i],     path: '/map' },
  { patterns: [/session/i, /charging/i],         path: '/bookings' },
  { patterns: [/profile/i, /account/i],          path: '/profile' },
  { patterns: [/vehicle/i, /car/i, /ev/i],       path: '/vehicles' },
  { patterns: [/home/i, /dashboard/i],           path: '/dashboard' },
  { patterns: [/host/i, /earn/i, /listing/i],    path: '/dashboard' },
]

/* ── Service ────────────────────────────────────────────────── */

export const IntentRouter = {

  /**
   * Parses a natural-language transcript into a structured intent.
   */
  parse(transcript: string): ParsedIntent {
    const lower = transcript.toLowerCase().trim()

    for (const { name, patterns } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(lower)) {
          // Extract entities
          const entities: ParsedIntent['entities'] = {}

          // Location extraction (crude — "near [place]")
          const locationMatch = /\bnear\s+([a-z\s]+?)(?:\.|,|$)/i.exec(transcript)
          if (locationMatch?.[1]) entities.location = locationMatch[1].trim()

          // Navigation destination
          if (name === 'navigate_to') {
            const destMatch = /\b(?:go\s+to|open|show\s+me|take\s+me\s+to)\s+(.+)/i.exec(transcript)
            if (destMatch?.[1]) entities.destination = destMatch[1].trim()
          }

          return {
            name,
            confidence: 'high',
            entities,
            originalTranscript: transcript,
          }
        }
      }
    }

    return {
      name: 'unknown',
      confidence: 'low',
      entities: {},
      originalTranscript: transcript,
    }
  },

  /**
   * Routes a parsed intent to an action.
   * Fast-path intents (navigate_to, cancel, help) are handled locally.
   * All others produce an ai_chat action to be sent to the AI service.
   */
  route(intent: ParsedIntent): IntentAction {
    switch (intent.name) {
      case 'cancel':
        return { type: 'speak', text: "OK, I'll stop listening." }

      case 'help':
        return {
          type: 'speak',
          text: "I can find chargers, start or stop your charging session, check your wallet balance, and help with bookings. Just tell me what you need.",
        }

      case 'navigate_to': {
        if (intent.entities.destination) {
          const dest = intent.entities.destination.toLowerCase()
          for (const { patterns, path } of NAV_DESTINATIONS) {
            if (patterns.some((p) => p.test(dest))) {
              return { type: 'navigate', path }
            }
          }
        }
        // Couldn't resolve — fall through to AI
        return { type: 'ai_chat', message: intent.originalTranscript }
      }

      case 'find_charger':
      case 'start_session':
      case 'stop_session':
      case 'get_session_status':
      case 'get_balance':
      case 'get_earnings':
      case 'unknown':
      default:
        return { type: 'ai_chat', message: intent.originalTranscript }
    }
  },

  /**
   * Convenience: parse + route in one call.
   */
  dispatch(transcript: string): { intent: ParsedIntent; action: IntentAction } {
    const intent = this.parse(transcript)
    const action = this.route(intent)
    return { intent, action }
  },
}
