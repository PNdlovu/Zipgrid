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

// ─────────────────────────────────────────────────────────────
// MODULE T — Smartwatch & Wearable UX (Planning Baseline v2.2)
// ─────────────────────────────────────────────────────────────

export type WearablePlatform = 'apple_watch' | 'wear_os' | 'garmin' | 'fitbit'

export type WearableNotificationType =
  | 'session_start'
  | 'session_complete'
  | 'session_live_update'
  | 'idle_fee_warning'
  | 'idle_fee_countdown'
  | 'arrival_assistant'
  | 'booking_request'
  | 'booking_approved'
  | 'booking_declined'
  | 'fault_alert'
  | 'weekly_earnings_summary'
  | 'commute_charge_scheduled'
  | 'price_spike_alert'
  | 'journey_charge_suggestion'
  | 'monthly_spend_insight'
  | 'family_safety_ping'
  | 'emergency_charge_found'

export type WearableDeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'dismissed'
  | 'actioned'

export type WatchActionButton = {
  label: string
  actionKey: string
}

/**
 * Payload pushed to FCM (phone relays to watch).
 * Built by NotificationService; delivered via FCM data message.
 */
export type WatchNotificationPayload = {
  notificationType: WearableNotificationType
  title: string
  body: string
  /** Action buttons rendered on the watch face */
  actionButtons?: WatchActionButton[]
  /** Deep-link opened on phone when user taps "View on phone" */
  deepLinkPath?: string
  /** Related entity IDs for routing on phone */
  bookingId?: string
  sessionId?: string
  listingId?: string
  agentTaskId?: string
}

export type WearableDevice = {
  id: string
  userId: string
  platform: WearablePlatform
  deviceName: string | null
  fcmToken: string
  osVersion: string | null
  deviceModel: string | null
  notifySessionStart: boolean
  notifySessionComplete: boolean
  notifyBookingApproved: boolean
  notifyIdleFeeWarning: boolean
  notifyArrivalAssistant: boolean
  notifyFaultAlert: boolean
  notifyWeeklyEarnings: boolean
  notifyFamilySafetyPing: boolean
  safetyPingContactIds: string[]
  isActive: boolean
  lastSeenAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type WearableNotification = {
  id: number
  deviceId: string
  userId: string
  notificationType: WearableNotificationType
  status: WearableDeliveryStatus
  bookingId: string | null
  sessionId: string | null
  listingId: string | null
  agentTaskId: string | null
  title: string
  body: string
  actionButtons: WatchActionButton[]
  tappedAction: string | null
  fcmMessageId: string | null
  createdAt: Date
  deliveredAt: Date | null
  actionedAt: Date | null
}

// ─────────────────────────────────────────────────────────────
// MODULE U — AI Commute Agent (Planning Baseline v2.2)
// ─────────────────────────────────────────────────────────────

export type CommuteDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type CommuteScheduleTrigger =
  | 'nightly_scheduler'
  | 'price_spike_reschedule'
  | 'journey_suggestion'
  | 'manual'

export type CommuteScheduleStatus =
  | 'scheduled'
  | 'executing'
  | 'completed'
  | 'skipped'
  | 'cancelled'
  | 'failed'

/**
 * A learned commute routine.
 * Created by the AI Commute Agent after 2+ weeks of pattern detection.
 * Requires explicit user consent before the agent acts on it.
 */
export type CommutePattern = {
  id: string
  userId: string
  name: string
  isActive: boolean
  homeLat: number | null
  homeLng: number | null
  workLat: number | null
  workLng: number | null
  workLocationName: string | null
  activeDays: CommuteDay[]
  typicalDepartureTime: string | null  // "HH:MM" format
  preferredListingId: string | null
  targetSocPct: number
  preferredTariff: string | null
  confidence: number     // 0.000–1.000
  sessionsAnalysed: number
  createdByAgentTaskId: string | null
  userConsented: boolean
  consentedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * A single scheduled commute charge event created by the AI.
 * The agent creates one of these each evening for the following night.
 */
export type CommuteSchedule = {
  id: string
  userId: string
  patternId: string | null
  trigger: CommuteScheduleTrigger
  status: CommuteScheduleStatus
  scheduledDate: string     // ISO date "YYYY-MM-DD"
  chargeWindowStart: Date
  chargeWindowEnd: Date
  targetSocPct: number
  tariffName: string | null
  avgRatePencePerKwh: number | null
  estimatedCostPence: number | null
  estimatedSavingPence: number | null
  gridScheduleId: string | null
  resultingSessionId: string | null
  decisionRationale: string | null
  notificationSent: boolean
  notificationId: number | null
  createdAt: Date
  updatedAt: Date
}

/** Extends AiSuggestion for commute-specific suggestion types */
export type CommuteAgentSuggestion = AiSuggestion & {
  type: 'commute_pattern_detected' | 'price_spike_reschedule' | 'journey_top_up' | 'monthly_saving_insight'
  estimatedSavingPence?: number
  scheduledWindowStart?: Date
  scheduledWindowEnd?: Date
  avgRatePencePerKwh?: number
}

// ─────────────────────────────────────────────────────────────
// VERTICAL SITE PROFILES (Planning Baseline v2.2)
// ─────────────────────────────────────────────────────────────

export type VenueVertical =
  | 'care_home'
  | 'warehouse_logistics'
  | 'hotel_hospitality'
  | 'retail_park'
  | 'sports_club'
  | 'church_community'
  | 'property_developer'
  | 'general_smb'

export type VerticalSiteProfile = {
  id: string
  hostProfileId: string
  vertical: VenueVertical

  // Care home
  cqcRegistrationNumber: string | null
  careHomeBedCount: number | null
  hasEsgReporting: boolean

  // Warehouse / logistics
  shiftPatternJson: Record<string, unknown> | null
  secrReportingEnabled: boolean
  fleetReimbursementEnabled: boolean

  // Hotel
  hotelStarRating: number | null
  pmsIntegrationType: string | null

  // Shared SMB
  companyRegistration: string | null
  vatNumber: string | null
  sustainabilityContactEmail: string | null
  monthlyEsgReportEnabled: boolean
  esgReportFormat: 'pdf' | 'csv' | 'json'

  createdAt: Date
  updatedAt: Date
}
