-- ============================================================
-- Migration 016: Wearable / Smartwatch UX & AI Commute Agent
-- ============================================================
-- Supports Module T (Smartwatch & Wearable UX) and
-- Module U (AI Commute Agent) from PRD v0.4.
--
-- New tables:
--   wearable_devices       — registered Apple Watch / Wear OS devices
--   wearable_notifications — log of every notification sent to a watch
--   commute_patterns       — learned commute routines per user
--   commute_schedules      — individual scheduled commute charge events
--
-- Schema additions:
--   agent_tasks.task_type ENUM extended (commute_charge_schedule,
--     price_spike_alert, journey_charge_suggestion,
--     monthly_spend_insight, battery_health_alert)
--   user_preferences: commute_agent columns
--
-- All monetary values in pence (INT). No floats.
-- Depends on: 001–015.
-- ============================================================


-- ============================================================
-- WEARABLE DEVICES
-- Registered smartwatch / wearable device per user.
-- Notifications sent via FCM to the paired phone, which
-- forwards to the watch. No separate push credential needed.
-- ============================================================

CREATE TYPE wearable_platform AS ENUM (
    'apple_watch',   -- watchOS via WatchKit companion
    'wear_os',       -- Wear OS via Jetpack Compose Wear companion
    'garmin',        -- Connect IQ (Phase 3+)
    'fitbit'         -- Phase 3+
);

CREATE TABLE wearable_devices (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    platform            wearable_platform   NOT NULL DEFAULT 'apple_watch',
    device_name         VARCHAR(100),       -- e.g. "Marcus's Apple Watch Series 9"

    -- FCM token of the paired phone (watch receives via phone relay)
    fcm_token           TEXT                NOT NULL,

    -- Watch model / OS version (for feature gating if needed)
    os_version          VARCHAR(30),
    device_model        VARCHAR(60),

    -- User notification preferences (overrides user-level defaults)
    notify_session_start        BOOLEAN NOT NULL DEFAULT TRUE,
    notify_session_complete     BOOLEAN NOT NULL DEFAULT TRUE,
    notify_booking_approved     BOOLEAN NOT NULL DEFAULT TRUE,
    notify_idle_fee_warning     BOOLEAN NOT NULL DEFAULT TRUE,
    notify_arrival_assistant    BOOLEAN NOT NULL DEFAULT TRUE,
    notify_fault_alert          BOOLEAN NOT NULL DEFAULT TRUE,
    notify_weekly_earnings      BOOLEAN NOT NULL DEFAULT TRUE,
    notify_family_safety_ping   BOOLEAN NOT NULL DEFAULT FALSE,

    -- Trusted contacts for family safety ping
    -- Array of user IDs who receive arrival safety pings
    safety_ping_contact_ids     UUID[]  NOT NULL DEFAULT '{}',

    is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
    last_seen_at        TIMESTAMPTZ,

    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wearable_devices_user   ON wearable_devices (user_id);
CREATE INDEX idx_wearable_devices_active ON wearable_devices (user_id) WHERE is_active = TRUE;

CREATE TRIGGER trg_wearable_devices_updated_at
    BEFORE UPDATE ON wearable_devices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- WEARABLE NOTIFICATIONS LOG
-- Append-only log of every notification sent to a watch.
-- Used for: delivery auditing, deduplication, analytics,
-- support investigation ("did you receive the idle fee warning?")
-- ============================================================

CREATE TYPE wearable_notification_type AS ENUM (
    'session_start',
    'session_complete',
    'session_live_update',       -- periodic SoC / cost update during charge
    'idle_fee_warning',
    'idle_fee_countdown',        -- T-10min and T-5min escalations
    'arrival_assistant',         -- 500m geofence trigger
    'booking_request',           -- host: new booking request
    'booking_approved',          -- driver: host approved booking
    'booking_declined',
    'fault_alert',               -- host: charger fault detected
    'weekly_earnings_summary',   -- host: Sunday evening summary
    'commute_charge_scheduled',  -- commute agent: charge scheduled tonight
    'price_spike_alert',         -- commute agent: Agile spike, rescheduled
    'journey_charge_suggestion', -- commute agent: long journey top-up suggested
    'monthly_spend_insight',     -- monthly summary
    'family_safety_ping',        -- trusted contact: user arrived safely
    'emergency_charge_found'     -- emergency mode: host accepted
);

CREATE TYPE wearable_delivery_status AS ENUM (
    'sent',         -- pushed to FCM, awaiting device ACK
    'delivered',    -- device confirmed receipt
    'failed',       -- FCM delivery failed
    'dismissed',    -- user dismissed on watch
    'actioned'      -- user tapped an action button
);

CREATE TABLE wearable_notifications (
    id                  BIGSERIAL                       PRIMARY KEY,
    device_id           UUID                            NOT NULL REFERENCES wearable_devices(id) ON DELETE CASCADE,
    user_id             UUID                            NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    notification_type   wearable_notification_type      NOT NULL,
    status              wearable_delivery_status        NOT NULL DEFAULT 'sent',

    -- Linked entities (nullable — depends on notification type)
    booking_id          UUID                            REFERENCES bookings(id),
    session_id          UUID                            REFERENCES charging_sessions(id),
    listing_id          UUID                            REFERENCES charger_listings(id),
    agent_task_id       UUID                            REFERENCES agent_tasks(id),

    -- Notification content (mirrored for audit purposes)
    title               VARCHAR(100)                    NOT NULL,
    body                TEXT                            NOT NULL,

    -- Action buttons shown on watch (JSON array of {label, action_key})
    action_buttons      JSONB                           DEFAULT '[]',
    -- e.g. [{"label":"Approve ✓","action_key":"booking_approve"},{"label":"Decline ✗","action_key":"booking_decline"}]

    -- Which action the user tapped (null = no action taken / dismissed)
    tapped_action       VARCHAR(60),

    -- FCM message ID for delivery tracking
    fcm_message_id      VARCHAR(200),

    created_at          TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
    delivered_at        TIMESTAMPTZ,
    actioned_at         TIMESTAMPTZ
);

CREATE INDEX idx_wearable_notifs_device  ON wearable_notifications (device_id, created_at DESC);
CREATE INDEX idx_wearable_notifs_user    ON wearable_notifications (user_id, created_at DESC);
CREATE INDEX idx_wearable_notifs_type    ON wearable_notifications (notification_type, created_at DESC);
CREATE INDEX idx_wearable_notifs_pending ON wearable_notifications (created_at DESC)
    WHERE status = 'sent';


-- ============================================================
-- COMMUTE PATTERNS
-- Learned commute routines per user.
-- Written by the AI Commute Agent after pattern detection
-- (minimum 2 weeks of consistent session history).
-- One active pattern per user (can have multiple inactive ones).
-- ============================================================

CREATE TYPE commute_day AS ENUM (
    'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'
);

CREATE TABLE commute_patterns (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Pattern metadata
    name                    VARCHAR(100) NOT NULL DEFAULT 'Daily commute',
    -- e.g. "Weekday Manchester commute"

    is_active               BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Inferred home and work locations
    home_lat                NUMERIC(10, 7),
    home_lng                NUMERIC(10, 7),
    work_lat                NUMERIC(10, 7),
    work_lng                NUMERIC(10, 7),
    work_location_name      VARCHAR(200),  -- e.g. "Nexus Coworking, Manchester"

    -- Schedule
    active_days             commute_day[]   NOT NULL DEFAULT '{mon,tue,wed,thu,fri}',
    typical_departure_time  TIME,           -- e.g. 08:30

    -- Preferred charging behaviour
    preferred_listing_id    UUID            REFERENCES charger_listings(id) ON DELETE SET NULL,
    target_soc_pct          SMALLINT        NOT NULL DEFAULT 85
                                            CHECK (target_soc_pct BETWEEN 20 AND 100),
    preferred_tariff        VARCHAR(30),    -- e.g. 'octopus_agile'

    -- Pattern confidence (0.0–1.0, from AI pattern detection)
    confidence              NUMERIC(4, 3)   NOT NULL DEFAULT 0.000,
    sessions_analysed       INT             NOT NULL DEFAULT 0,

    -- Agent task that created this pattern
    created_by_agent_task_id UUID           REFERENCES agent_tasks(id),

    -- User consent (must be explicitly granted before agent acts on pattern)
    user_consented          BOOLEAN         NOT NULL DEFAULT FALSE,
    consented_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commute_patterns_user   ON commute_patterns (user_id) WHERE is_active = TRUE;
CREATE INDEX idx_commute_patterns_active ON commute_patterns (user_id, is_active);

CREATE TRIGGER trg_commute_patterns_updated_at
    BEFORE UPDATE ON commute_patterns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- COMMUTE SCHEDULES
-- Individual charge events created by the AI Commute Agent.
-- One row per night/trip the agent acts on.
-- Links back to a commute_pattern and optionally to a
-- resulting grid_schedule or booking.
-- ============================================================

CREATE TYPE commute_schedule_trigger AS ENUM (
    'nightly_scheduler',        -- triggered by 21:00 cron
    'price_spike_reschedule',   -- Agile spike detected, agent rescheduled
    'journey_suggestion',       -- long trip detected, agent suggested top-up
    'manual'                    -- user manually requested via voice/app
);

CREATE TYPE commute_schedule_status AS ENUM (
    'scheduled',
    'executing',
    'completed',
    'skipped',       -- agent determined no charge needed tonight
    'cancelled',     -- user cancelled
    'failed'
);

CREATE TABLE commute_schedules (
    id                      UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID                        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id              UUID                        REFERENCES commute_patterns(id) ON DELETE SET NULL,

    trigger                 commute_schedule_trigger    NOT NULL DEFAULT 'nightly_scheduler',
    status                  commute_schedule_status     NOT NULL DEFAULT 'scheduled',

    -- Target charge
    scheduled_date          DATE                        NOT NULL,
    charge_window_start     TIMESTAMPTZ                 NOT NULL,
    charge_window_end       TIMESTAMPTZ                 NOT NULL,
    target_soc_pct          SMALLINT                    NOT NULL DEFAULT 85,

    -- Tariff context at scheduling time
    tariff_name             VARCHAR(60),
    avg_rate_pence_per_kwh  NUMERIC(6, 2),
    estimated_cost_pence    INT,

    -- Money saved vs charging at peak rate
    estimated_saving_pence  INT,

    -- Linked outputs
    grid_schedule_id        UUID                        REFERENCES grid_schedules(id),
    resulting_session_id    UUID                        REFERENCES charging_sessions(id),

    -- Agent decision rationale (shown in /profile/ai-history)
    decision_rationale      TEXT,
    -- e.g. "Cheapest 3-hour window is 02:00–05:00 at avg 8.2p/kWh.
    --        Current SoC estimated at 41%. Need 22.1 kWh to reach 85%."

    -- Wearable notification sent
    notification_sent       BOOLEAN                     NOT NULL DEFAULT FALSE,
    notification_id         BIGINT                      REFERENCES wearable_notifications(id),

    created_at              TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commute_schedules_user    ON commute_schedules (user_id, scheduled_date DESC);
CREATE INDEX idx_commute_schedules_status  ON commute_schedules (status, charge_window_start)
    WHERE status IN ('scheduled', 'executing');
CREATE INDEX idx_commute_schedules_pattern ON commute_schedules (pattern_id) WHERE pattern_id IS NOT NULL;

CREATE TRIGGER trg_commute_schedules_updated_at
    BEFORE UPDATE ON commute_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- EXTEND agent_tasks.task_type ENUM
-- New task types for the AI Commute Agent (Module U).
-- ============================================================

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'commute_charge_schedule';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'price_spike_alert';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'journey_charge_suggestion';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'monthly_spend_insight';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'battery_health_alert';


-- ============================================================
-- EXTEND user_preferences WITH COMMUTE AGENT COLUMNS
-- ============================================================

ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS commute_agent_enabled          BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS commute_agent_paused_until     TIMESTAMPTZ,
    -- User can say "skip this week" → agent pauses until this timestamp

    ADD COLUMN IF NOT EXISTS commute_agent_min_saving_pence INT         DEFAULT 50,
    -- Agent only schedules if estimated saving >= this amount (default £0.50)

    ADD COLUMN IF NOT EXISTS commute_agent_consent_at       TIMESTAMPTZ,

    ADD COLUMN IF NOT EXISTS safety_ping_enabled            BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Family safety ping: notify trusted contacts when driver arrives at charger

    ADD COLUMN IF NOT EXISTS wearable_registered            BOOLEAN     NOT NULL DEFAULT FALSE;
    -- Set to TRUE when first wearable_device row is created for this user


COMMENT ON COLUMN user_preferences.commute_agent_enabled IS
    'User has enabled the AI Commute Agent (Module U). Requires explicit opt-in.';
COMMENT ON COLUMN user_preferences.safety_ping_enabled IS
    'Send arrival notification to trusted contacts when driver starts a session.';


-- ============================================================
-- VERTICAL SITE PROFILES
-- Stores sector-specific metadata for SMB hosts.
-- Used to enable vertical-specific features (care home ESG,
-- warehouse shift scheduling, hotel guest booking links).
-- ============================================================

CREATE TYPE venue_vertical AS ENUM (
    'care_home',
    'warehouse_logistics',
    'hotel_hospitality',
    'retail_park',
    'sports_club',
    'church_community',
    'property_developer',
    'general_smb'
);

CREATE TABLE vertical_site_profiles (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    host_profile_id             UUID            NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,

    vertical                    venue_vertical  NOT NULL DEFAULT 'general_smb',

    -- Care home specific
    cqc_registration_number     VARCHAR(20),
    care_home_bed_count         SMALLINT,
    has_esg_reporting           BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Warehouse / logistics specific
    shift_pattern_json          JSONB,
    -- e.g. {"mon":{"day":"06:00-14:00","late":"14:00-22:00","night":"22:00-06:00"}, ...}
    secr_reporting_enabled      BOOLEAN         NOT NULL DEFAULT FALSE,
    fleet_reimbursement_enabled BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Hotel specific
    hotel_star_rating           SMALLINT        CHECK (hotel_star_rating BETWEEN 1 AND 5),
    pms_integration_type        VARCHAR(50),    -- 'mews' | 'opera' | 'none'

    -- Shared SMB fields
    company_registration        VARCHAR(100),
    vat_number                  VARCHAR(50),
    sustainability_contact_email VARCHAR(254),
    monthly_esg_report_enabled  BOOLEAN         NOT NULL DEFAULT FALSE,
    esg_report_format           VARCHAR(10)     DEFAULT 'pdf',  -- 'pdf' | 'csv' | 'json'

    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_vertical_site_host UNIQUE (host_profile_id)
);

CREATE INDEX idx_vertical_site_vertical ON vertical_site_profiles (vertical);
CREATE INDEX idx_vertical_site_host     ON vertical_site_profiles (host_profile_id);

CREATE TRIGGER trg_vertical_site_profiles_updated_at
    BEFORE UPDATE ON vertical_site_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- MIGRATION COMPLETE
-- Run after: 015_community_parking_esg_phase3.sql
-- ============================================================
