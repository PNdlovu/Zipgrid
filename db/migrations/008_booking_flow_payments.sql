-- ============================================================
-- Migration 008: Booking Flow & Payment Columns
-- ============================================================
-- Adds columns required by Module D (Booking Flow) and
-- Module E (Payments) that are referenced in BookingService
-- and StripeService but were not present in earlier migrations.
--
-- All changes are additive (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- so this migration is safe to re-run.
-- ============================================================

-- ── bookings — stripe_payment_intent_id column ────────────────────────
-- Stores the Stripe PaymentIntent id for the authorization hold.
-- Migration 004 does not include this column; we add it here.
ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_stripe_pi
  ON bookings (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ── bookings — host_approved_at ───────────────────────────────────────
-- Already in migration 004 schema comment but confirm column exists.
ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS host_approved_at TIMESTAMPTZ;

-- ── bookings — cancellation_reason text alias ─────────────────────────
-- Migration 004 has "cancellation_reason cancellation_reason" (enum)
-- AND "cancellation_note TEXT". BookingService writes to cancellation_note.
-- No change needed — just documentation.

-- ── transactions — session_id optional ───────────────────────────────
-- Already nullable in migration 004. Confirm FK exists.
-- (No DDL needed — documenting here for clarity.)

-- ── users — stripe_customer_id ────────────────────────────────────────
-- Already added in migration 002. Adding IF NOT EXISTS for safety.
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ── driver_profiles — stripe_customer_id denorm ───────────────────────
-- Drivers pay via Stripe. stripe_customer_id lives on users table.
-- No separate column needed on driver_profiles — JOIN to users.

-- ── host_profiles — stripe_connect fields ────────────────────────────
-- Migration 007 already adds these via ALTER TABLE. Idempotent re-add:
ALTER TABLE IF EXISTS host_profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded   BOOLEAN DEFAULT false;

-- ── Ensure booking_status enum has all values used by BookingService ──
-- Migration 004 defines: pending, confirmed, cancelled_by_driver,
-- cancelled_by_host, cancelled_by_platform, completed, no_show.
-- BookingService uses exactly these values — no change needed.

-- ── Ensure transaction_status enum has all values used ────────────────
-- Migration 004 defines: hold_placed, captured, partially_refunded,
-- fully_refunded, disputed, failed.
-- StripeService webhook maps to these — no change needed.

-- ── session_meter_values — ensure index exists ────────────────────────
CREATE INDEX IF NOT EXISTS idx_meter_values_session_time_v2
  ON session_meter_values (session_id, recorded_at DESC);

-- ── Index: fast lookup of confirmed/pending bookings per listing ───────
-- Supports the availability overlap check in AvailabilityService.isAvailable
CREATE INDEX IF NOT EXISTS idx_bookings_listing_schedule
  ON bookings (listing_id, scheduled_start, scheduled_end)
  WHERE status IN ('pending', 'confirmed');

-- ── Index: driver booking history ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_driver_start
  ON bookings (driver_profile_id, scheduled_start DESC);

-- ── Webhook idempotency: stripe_event_id tracking ────────────────────
-- Prevents duplicate processing of Stripe webhooks on retry.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id              VARCHAR(100) PRIMARY KEY,   -- Stripe evt_xxx id
  event_type      VARCHAR(80)  NOT NULL,
  processed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
