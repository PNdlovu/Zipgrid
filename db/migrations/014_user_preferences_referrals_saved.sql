-- ============================================================
-- Migration 014: User Preferences, Referrals, Saved Listings
-- ============================================================
-- Supports: long-term AI user preferences, referral programme,
-- driver saved/favourite listings.
-- ============================================================


-- ------------------------------------------------------------
-- USER PREFERENCES
-- Long-term preferences stored per user.
-- Used by the AI agent to personalise recommendations and
-- auto-scheduling decisions across sessions.
-- ------------------------------------------------------------

CREATE TABLE user_preferences (
    user_id                 UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Charging preferences
    preferred_tariff        VARCHAR(30) DEFAULT 'octopus_agile',
    -- e.g. 'octopus_agile' | 'octopus_go' | 'economy_7' | 'edf_goelectric' | 'eon_drive' | 'flat'

    preferred_charge_start_time     TIME,           -- e.g. 23:30 (off-peak start)
    preferred_charge_end_time       TIME,           -- e.g. 07:00 (wake-up)
    preferred_target_soc_pct        SMALLINT DEFAULT 80 CHECK (preferred_target_soc_pct BETWEEN 10 AND 100),
    preferred_min_range_km          SMALLINT DEFAULT 80,  -- minimum range before charging needed

    -- Location preferences
    preferred_max_radius_km         SMALLINT DEFAULT 5,
    home_lat                        NUMERIC(10, 7),
    home_lng                        NUMERIC(10, 7),
    work_lat                        NUMERIC(10, 7),
    work_lng                        NUMERIC(10, 7),

    -- Notification preferences
    notify_idle_fee_warning         BOOLEAN NOT NULL DEFAULT TRUE,
    notify_session_complete         BOOLEAN NOT NULL DEFAULT TRUE,
    notify_booking_reminder         BOOLEAN NOT NULL DEFAULT TRUE,
    notify_price_spike_alert        BOOLEAN NOT NULL DEFAULT TRUE,  -- Agile tariff spike
    notify_low_battery_alert        BOOLEAN NOT NULL DEFAULT TRUE,

    -- Voice preferences
    preferred_voice_mode            VARCHAR(20) DEFAULT 'hybrid',   -- standard|hybrid|agentic
    voice_confirmation_required     BOOLEAN NOT NULL DEFAULT TRUE,  -- ask before booking
    preferred_tts_rate              NUMERIC(3,2) DEFAULT 1.05,      -- speech rate

    -- AI agent preferences
    ai_auto_schedule_enabled        BOOLEAN NOT NULL DEFAULT FALSE,  -- auto-book cheapest slot
    ai_data_collection_consent      BOOLEAN NOT NULL DEFAULT FALSE,  -- use session data for AI personalisation

    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a preferences row when a user registers
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_user_preferences
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_user_preferences();


-- ------------------------------------------------------------
-- SAVED LISTINGS
-- Drivers can bookmark/favourite charger listings.
-- ------------------------------------------------------------

CREATE TABLE saved_listings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id      UUID        NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_saved_listing UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_saved_listings_user    ON saved_listings (user_id, created_at DESC);
CREATE INDEX idx_saved_listings_listing ON saved_listings (listing_id);


-- ------------------------------------------------------------
-- USER REFERRALS
-- Tracks referral relationships and credit award status.
-- Credit is awarded to both parties after the referee's first
-- completed charging session.
-- ------------------------------------------------------------

CREATE TYPE referral_status AS ENUM (
    'pending',    -- referee registered but not yet completed first session
    'credited',   -- both parties credited (wallet + points)
    'expired'     -- referee never completed first session within 90 days
);

CREATE TABLE user_referrals (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_user_id    UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_user_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code       VARCHAR(12)     NOT NULL,
    status              referral_status NOT NULL DEFAULT 'pending',
    credit_pence        INT             NOT NULL DEFAULT 500,   -- £5 per referral
    credited_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW() + INTERVAL '90 days',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_referee UNIQUE (referee_user_id)   -- one referral code per new user
);

CREATE INDEX idx_referrals_referrer ON user_referrals (referrer_user_id);
CREATE INDEX idx_referrals_status   ON user_referrals (status) WHERE status = 'pending';


-- ------------------------------------------------------------
-- HOST SAFETY CHECKLIST
-- Separate table for the safety declaration answers collected
-- during onboarding (already in safety_scores but kept here
-- as the canonical write target during the wizard flow).
-- Actually: safety_scores already has has_rcd_protection,
-- is_electrician_installed, charger_install_year.
-- This migration adds the insurance_tos_accepted column.
-- ------------------------------------------------------------

ALTER TABLE charger_listings
    ADD COLUMN IF NOT EXISTS insurance_tos_accepted     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS insurance_tos_accepted_at  TIMESTAMPTZ;

COMMENT ON COLUMN charger_listings.insurance_tos_accepted IS
    'Host accepted platform insurance terms at listing creation';
