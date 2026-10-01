/**
 * @file index.ts
 * @description Shared TypeScript type re-exports for the Next.js web app.
 *
 * Re-exports the canonical types from @zipgrid/types for use in pages,
 * components, and API routes — avoiding repeated `../../..` import paths.
 *
 * @module apps/web/types
 * @version 0.1.0
 * @since 2026-09-26
 * @author Zipgrid Engineering
 */

// Core domain types from the shared package
export type {
  // Users & identity
  User,
  DriverProfile,
  HostProfile,
  KycStatus,
  UserRole,
} from '@zipgrid/types'

export type {
  // Listings
  ChargerListing,
  ChargerLevel,
  PlugType,
  PricingModel,
  ListingStatus,
  ListingPhoto,
  AvailabilitySchedule,
} from '@zipgrid/types'

export type {
  // Bookings
  Booking,
  BookingStatus,
  CreateBookingPayload,
} from '@zipgrid/types'

export type {
  // Sessions
  ChargingSession,
  SessionStatus,
  MeterValuePayload,
} from '@zipgrid/types'

export type {
  // Payments
  Transaction,
  Payout,
  TransactionStatus,
} from '@zipgrid/types'

export type {
  // Rewards & wallet
  RewardBalance,
  RewardTier,
  WalletTransaction,
} from '@zipgrid/types'

export type {
  // AI
  AgentMode,
  IntentCategory,
} from '@zipgrid/types'

export type {
  // API envelope
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  PaginatedMeta,
} from '@zipgrid/types'

// ── Web-app-specific types ────────────────────────────────────────────────────
// These are types used only within the Next.js app (not in mobile or the AI service).

/** Pagination state used by list hooks */
export type PaginationState = {
  page: number
  pageSize: number
  total: number
}

/** Generic async action state for UI loading/error patterns */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

/** Notification item shape used by the notification centre */
export type NotificationItem = {
  id: string
  category: string
  title: string
  body: string
  actionUrl: string | null
  isRead: boolean
  createdAt: string
}

/** Filter state for listing search */
export type ListingSearchFilters = {
  plugTypes: string[]
  minPowerKw: number | null
  maxPricePence: number | null
  instantBookOnly: boolean
  availableNow: boolean
  superhostOnly: boolean
}

/** Charger health summary used by the host charger detail page */
export type ChargerHealthSummary = {
  chargerId: string
  chargePointId: string
  brand: string
  model: string
  connected: boolean
  status: string
  firmwareVersion: string | null
  lastHeartbeat: string | null
  healthScore: number
  activeSessions: number
}
