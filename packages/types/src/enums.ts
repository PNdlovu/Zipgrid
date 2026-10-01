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

// ─────────────────────────────────────────────────────────────
// Module T / U additions — Planning Baseline v2.2
// ─────────────────────────────────────────────────────────────

export enum WearablePlatformEnum {
  AppleWatch = 'apple_watch',
  WearOS = 'wear_os',
  Garmin = 'garmin',
  Fitbit = 'fitbit',
}

export enum AgentTaskType {
  FaultDiagnosis = 'fault_diagnosis',
  TariffScheduling = 'tariff_scheduling',
  InstallerSuggestion = 'installer_suggestion',
  PricingSuggestion = 'pricing_suggestion',
  IdleFeeAlert = 'idle_fee_alert',
  RecurringBooking = 'recurring_booking',
  ReviewResponseDraft = 'review_response_draft',
  DemandSpikeAlert = 'demand_spike_alert',
  General = 'general',
  // Module U — AI Commute Agent
  CommuteChargeSchedule = 'commute_charge_schedule',
  PriceSpikeAlert = 'price_spike_alert',
  JourneyChargeSuggestion = 'journey_charge_suggestion',
  MonthlySpendInsight = 'monthly_spend_insight',
  BatteryHealthAlert = 'battery_health_alert',
}

export enum VenueVerticalEnum {
  CareHome = 'care_home',
  WarehouseLogistics = 'warehouse_logistics',
  HotelHospitality = 'hotel_hospitality',
  RetailPark = 'retail_park',
  SportsClub = 'sports_club',
  ChurchCommunity = 'church_community',
  PropertyDeveloper = 'property_developer',
  GeneralSmb = 'general_smb',
}

// ─────────────────────────────────────────────────────────────
// Planning Baseline v2.3 additions
// ─────────────────────────────────────────────────────────────

export enum SupportedVoiceLocale {
  EnGB = 'en-GB',
  EnIE = 'en-IE',
  NlNL = 'nl-NL',
  DeDE = 'de-DE',
  FrBE = 'fr-BE',
  FrFR = 'fr-FR',
  EsES = 'es-ES',
  PlPL = 'pl-PL',
  RoRO = 'ro-RO',
}

export enum PoiCategory {
  Toilet = 'toilet',
  Restaurant = 'restaurant',
  Cafe = 'cafe',
  PlayArea = 'play_area',
  Supermarket = 'supermarket',
  Pharmacy = 'pharmacy',
  Park = 'park',
  Hotel = 'hotel',
  PetrolStation = 'petrol_station',
}

export enum ListingHealthInsightType {
  PhotosStale = 'photos_stale',
  PhotosMissing = 'photos_missing',
  DescriptionShort = 'description_short',
  InstructionsUnclear = 'instructions_unclear',
  InstructionsMissing = 'instructions_missing',
  PriceBelowMarket = 'price_below_market',
  PriceAboveMarket = 'price_above_market',
  AvailabilityNarrow = 'availability_narrow',
  ResponseTimeSlow = 'response_time_slow',
  ReviewsLow = 'reviews_low',
  ReviewsStale = 'reviews_stale',
  AccessibilityIncomplete = 'accessibility_incomplete',
  AllGood = 'all_good',
}
