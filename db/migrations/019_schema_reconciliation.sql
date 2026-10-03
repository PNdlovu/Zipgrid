-- ============================================================
-- Migration 019: Schema reconciliation
-- ============================================================
-- Brings the schema in line with the application code:
--   * columns/enum values the code relies on that were never migrated
--   * tables for shipped features that had no migration
--   * notifications reshaped to support the multi-channel model used by
--     NotificationService (one row per notification, read state via read_at)
--
-- Every statement is idempotent so this applies cleanly to a fresh database
-- and to databases that were partially built by the old setup scripts.
-- ============================================================

-- Enum values used here are added in 018 (a new enum value cannot be used in
-- the transaction that creates it).

-- ── users ────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
UPDATE users SET display_name = full_name WHERE display_name IS NULL;
-- Password-reset tokens issued before this instant are void (single use).
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
-- OAuth identities (provider subject ids) linked to the account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub  VARCHAR(255) UNIQUE;
-- Keep the boolean and timestamp verification flags consistent.
UPDATE users SET email_verified = TRUE WHERE email_verified_at IS NOT NULL AND NOT email_verified;

-- ── OTP brute-force protection ───────────────────────────────
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;

-- ── auth_sessions: refresh-token rotation ────────────────────
-- replaced_by/revoked_at let concurrent refreshes of the same token (two tabs,
-- parallel requests) resolve to the replacement session instead of looking
-- like token theft.
ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS replaced_by UUID,
    ADD COLUMN IF NOT EXISTS revoked_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
    ON auth_sessions (user_id) WHERE NOT revoked;

-- ── charger_listings ─────────────────────────────────────────
-- UK addresses have no state/province; county is optional.
ALTER TABLE charger_listings ALTER COLUMN state_province DROP NOT NULL;
ALTER TABLE charger_listings ALTER COLUMN country_code SET DEFAULT 'GB';

-- ── audit_log: free-form action names ────────────────────────
-- Domain events (USER_REGISTERED, BOOKING_CONFIRMED, ...) and admin actions
-- are recorded verbatim; a fixed enum silently dropped most of them.
ALTER TABLE audit_log ALTER COLUMN action TYPE VARCHAR(64) USING action::text;
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- ── charging_sessions: tariff snapshot ───────────────────────
-- Copied from the booking at session start so the OCPP service can price the
-- session without joining back through bookings/listings.
ALTER TABLE charging_sessions
    ADD COLUMN IF NOT EXISTS pricing_model            pricing_model,
    ADD COLUMN IF NOT EXISTS price_per_hour_cents     INTEGER,
    ADD COLUMN IF NOT EXISTS price_per_session_cents  INTEGER,
    ADD COLUMN IF NOT EXISTS idle_fee_per_min_cents   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS peak_power_w             INTEGER,
    ADD COLUMN IF NOT EXISTS duration_minutes         INTEGER;

-- ── transactions: final-capture bookkeeping ──────────────────
-- authorized_cents: amount held on the card (capture can never exceed it).
-- shortfall_cents:  final cost above the hold that could not be captured.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS authorized_cents  INTEGER,
    ADD COLUMN IF NOT EXISTS shortfall_cents   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS capture_error     TEXT,
    ADD COLUMN IF NOT EXISTS capture_attempts  SMALLINT NOT NULL DEFAULT 0;
UPDATE transactions SET authorized_cents = subtotal_cents WHERE authorized_cents IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_pending_capture
    ON transactions (created_at) WHERE status = 'hold_placed';
-- One transaction per booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_booking ON transactions (booking_id);

-- ── bookings: deferred payment authorisation ─────────────────
-- Card holds expire after ~7 days, so bookings further out (and recurring
-- series) keep the payment method and are authorised 24h before the slot.
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS payment_method_id    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS recurring_series_id  UUID;
CREATE INDEX IF NOT EXISTS idx_bookings_recurring_series
    ON bookings (recurring_series_id) WHERE recurring_series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_listing_window
    ON bookings (listing_id, scheduled_start, scheduled_end);

-- ── notifications ────────────────────────────────────────────
ALTER TABLE notifications ALTER COLUMN channel DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN type    DROP NOT NULL;
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS category            VARCHAR(50),
    ADD COLUMN IF NOT EXISTS metadata            JSONB   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS channels_requested  TEXT[]  NOT NULL DEFAULT '{in_app}',
    ADD COLUMN IF NOT EXISTS email_sent_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sms_sent_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$ BEGIN
    ALTER TABLE notifications
        ADD COLUMN is_read BOOLEAN GENERATED ALWAYS AS (read_at IS NOT NULL) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- One preferences row per user (the per-channel/per-type table from 005 was
-- never used by any code path).
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'notification_preferences' AND column_name = 'channel') THEN
        DROP TABLE notification_preferences;
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    push_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    categories_disabled  TEXT[]  NOT NULL DEFAULT '{}',
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Charger maintenance log ──────────────────────────────────
CREATE TABLE IF NOT EXISTS charger_maintenance_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charger_device_id   UUID NOT NULL REFERENCES charger_devices(id) ON DELETE CASCADE,
    type                VARCHAR(30) NOT NULL,
    note                TEXT NOT NULL,
    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_charger_maintenance_device
    ON charger_maintenance_log (charger_device_id, created_at DESC);

-- ── Dispute evidence ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispute_evidence (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id           UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    file_url             TEXT NOT NULL,
    file_name            VARCHAR(255) NOT NULL,
    file_type            VARCHAR(100) NOT NULL,
    file_size_bytes      INTEGER NOT NULL CHECK (file_size_bytes >= 0),
    uploaded_by_user_id  UUID NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id);

-- ── Listing access rules (private / discounted access) ───────
CREATE TABLE IF NOT EXISTS listing_access_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id    UUID NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,
    rule_type     VARCHAR(30) NOT NULL,
    value         TEXT,
    discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
    max_uses      INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
    use_count     INTEGER NOT NULL DEFAULT 0,
    label         VARCHAR(100),
    qr_token      VARCHAR(64) UNIQUE,
    expires_at    TIMESTAMPTZ,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listing_access_rules_listing
    ON listing_access_rules (listing_id) WHERE is_active;

-- ── Carbon credits ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carbon_charities (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(150) NOT NULL,
    description  TEXT,
    logo_url     TEXT,
    website      TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carbon_credit_ledger (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action       VARCHAR(10) NOT NULL CHECK (action IN ('earn','sell','donate','retire')),
    credits      INTEGER NOT NULL CHECK (credits > 0),
    value_pence  INTEGER NOT NULL DEFAULT 0,
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_carbon_ledger_user ON carbon_credit_ledger (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS carbon_donations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    charity_id  UUID NOT NULL REFERENCES carbon_charities(id),
    credits     INTEGER NOT NULL CHECK (credits > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Developer integrations + agent marketplace ───────────────
CREATE TABLE IF NOT EXISTS developer_integrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name        VARCHAR(150) NOT NULL,
    contact_email       CITEXT NOT NULL,
    development_name    VARCHAR(150),
    number_of_bays      INTEGER,
    expected_open_date  DATE,
    website             TEXT,
    integration_type    VARCHAR(40) NOT NULL,
    sdk_key             VARCHAR(80) NOT NULL UNIQUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','approved','rejected','suspended')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_agents (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_integration_id  UUID REFERENCES developer_integrations(id) ON DELETE CASCADE,
    name                      VARCHAR(100) NOT NULL,
    slug                      VARCHAR(100) NOT NULL UNIQUE,
    description               TEXT NOT NULL,
    long_description          TEXT,
    category                  VARCHAR(40) NOT NULL,
    target_roles              TEXT[] NOT NULL DEFAULT '{}',
    webhook_url               TEXT NOT NULL,
    permissions               JSONB NOT NULL DEFAULT '[]',
    icon_url                  TEXT,
    developer_name            VARCHAR(150) NOT NULL,
    developer_website         TEXT,
    pricing_model             VARCHAR(20) NOT NULL DEFAULT 'free',
    monthly_price_pence       INTEGER,
    status                    VARCHAR(20) NOT NULL DEFAULT 'pending_review'
                              CHECK (status IN ('pending_review','approved','rejected','suspended')),
    install_count             INTEGER NOT NULL DEFAULT 0,
    average_rating            NUMERIC(3,2),
    review_count              INTEGER NOT NULL DEFAULT 0,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Connected-vehicle OEM tokens ─────────────────────────────
-- access_token / refresh_token are stored AES-256-GCM encrypted by the app
-- (see apps/web/src/lib/crypto.ts), never in plaintext.
CREATE TABLE IF NOT EXISTS vehicle_oem_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    oem            VARCHAR(30) NOT NULL,
    access_token   TEXT NOT NULL,
    refresh_token  TEXT,
    vehicle_ref    VARCHAR(100),
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, oem)
);

-- ── Roadside assistance requests ─────────────────────────────
CREATE TABLE IF NOT EXISTS roadside_incidents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    incident_type  VARCHAR(40) NOT NULL,
    latitude       NUMERIC(10,7),
    longitude      NUMERIC(10,7),
    description    TEXT,
    partner_id     VARCHAR(60),
    status         VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Grid demand-response signals ─────────────────────────────
CREATE TABLE IF NOT EXISTS grid_demand_signals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type  VARCHAR(40) NOT NULL,
    target_kw    NUMERIC(10,2),
    region       VARCHAR(40) NOT NULL DEFAULT 'all',
    valid_until  TIMESTAMPTZ NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── OCPI roaming partners ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ocpi_partners (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(150) NOT NULL,
    country_code  CHAR(2) NOT NULL,
    party_id      VARCHAR(3) NOT NULL,
    role          ocpi_role NOT NULL,
    token_a       VARCHAR(255),
    token_b       VARCHAR(255) UNIQUE,
    token_c       VARCHAR(255),
    versions_url  TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── White-label tenants ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS white_label_tenants (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_slug          VARCHAR(60) NOT NULL UNIQUE,
    brand_name           VARCHAR(100) NOT NULL,
    primary_colour       VARCHAR(9),
    secondary_colour     VARCHAR(9),
    logo_url             TEXT,
    favicon_url          TEXT,
    custom_domain        VARCHAR(255) UNIQUE,
    support_email        CITEXT,
    commission_rate_pct  NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    feature_flags        JSONB NOT NULL DEFAULT '{}',
    tenant_url           TEXT,
    status               VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── OCPP ─────────────────────────────────────────────────────
-- Chargers authenticate with HTTP Basic (OCPP security profile 1/2); only the
-- SHA-256 of the pairing key is stored, so the plaintext column is optional.
ALTER TABLE charger_devices ALTER COLUMN api_key DROP NOT NULL;
-- OCPP transactionId must be unique per central system across restarts and
-- replicas; a sequence guarantees that.
CREATE SEQUENCE IF NOT EXISTS ocpp_transaction_id_seq START WITH 100000;
CREATE INDEX IF NOT EXISTS idx_charging_sessions_cp_tx
    ON charging_sessions (charge_point_id, ocpp_transaction_id);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_cp_tag
    ON charging_sessions (charge_point_id, ocpp_id_tag) WHERE status = 'preparing';

-- ── Double-booking guard ─────────────────────────────────────
-- Serialises booking inserts per listing; BookingService takes this lock
-- inside its transaction before the overlap check.
CREATE OR REPLACE FUNCTION lock_listing_for_booking(p_listing UUID)
RETURNS VOID LANGUAGE sql AS $$
    SELECT pg_advisory_xact_lock(hashtextextended(p_listing::text, 0));
$$;
