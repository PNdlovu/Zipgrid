/**
 * @file ai.ts
 * @description AI/Voice intent and response type definitions.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import type { AiMode } from './enums'

export type VoiceIntent = {
  raw: string
  intent:
    | 'book_charger'
    | 'start_session'
    | 'stop_session'
    | 'find_charger'
    | 'check_booking'
    | 'check_session'
    | 'navigate_to'
    | 'check_earnings'
    | 'contact_support'
    | 'unknown'
  confidence: number
  entities: Record<string, string | number | boolean>
  requiresConfirmation: boolean
}

export type AgentMessage = {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCall: string | null
  toolResult: string | null
  mode: AiMode
  timestamp: Date
}

export type AiSuggestion = {
  type: 'pricing' | 'schedule' | 'fault_diagnosis' | 'trip_plan'
  confidence: number
  title: string
  description: string
  action: string | null
  actionLabel: string | null
}
