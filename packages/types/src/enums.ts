/**
 * @file enums.ts
 * @description All platform enums — shared across web, mobile, ocpp-service, ai-service.
 * Use string enums for serialisation safety (values survive JSON round-trips).
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export enum UserRole {
  Driver = 'driver',
  Host = 'host',
  Installer = 'installer',
  Admin = 'admin',
}

export enum KycStatus {
  NotStarted = 'not_started',
  Pending = 'pending',
  Verified = 'verified',
  Rejected = 'rejected',
}

export enum BookingStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
  NoShow = 'no_show',
}

export enum SessionStatus {
  Preparing = 'preparing',
  Charging = 'charging',
  Paused = 'paused',
  Finishing = 'finishing',
  Completed = 'completed',
  Faulted = 'faulted',
}

export enum ListingStatus {
  Draft = 'draft',
  Published = 'published',
  Paused = 'paused',
  Archived = 'archived',
}

export enum ConnectorType {
  Type2 = 'type_2',
  CCS2 = 'ccs_2',
  CHAdeMO = 'chademo',
  NACS = 'nacs',
  NEMA = 'nema_14_50',
  Tethered = 'tethered_type_2',
}

export enum PaymentStatus {
  Pending = 'pending',
  RequiresCapture = 'requires_capture',
  Captured = 'captured',
  Refunded = 'refunded',
  Failed = 'failed',
}

export enum TransactionType {
  Booking = 'booking',
  WalletTopup = 'wallet_topup',
  WalletSpend = 'wallet_spend',
  Refund = 'refund',
  Payout = 'payout',
}

export enum ReviewStatus {
  Pending = 'pending',
  Published = 'published',
  Hidden = 'hidden',
}

export enum IncidentSeverity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export enum OcppStatus {
  Available = 'Available',
  Preparing = 'Preparing',
  Charging = 'Charging',
  SuspendedEVSE = 'SuspendedEVSE',
  SuspendedEV = 'SuspendedEV',
  Finishing = 'Finishing',
  Reserved = 'Reserved',
  Unavailable = 'Unavailable',
  Faulted = 'Faulted',
}

export enum AiMode {
  Standard = 'standard',
  Hybrid = 'hybrid',
  Agentic = 'agentic',
}

export enum RewardsTier {
  Bronze = 'bronze',
  Silver = 'silver',
  Gold = 'gold',
  Platinum = 'platinum',
}
