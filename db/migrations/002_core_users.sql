-- ============================================================
-- Migration 002: Core Users, Hosts & Drivers
-- ============================================================
-- A single "users" table is the identity source of truth.
-- A user can be BOTH a host and a driver simultaneously.
-- Roles are stored in an array to allow dual participation.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE user_role AS ENUM (
    'driver',
    'host',
    'admin'
);

CREATE TYPE account_status AS ENUM (
    'pending_verification',  -- email not yet confirmed
    'active',
    'suspended',             -- policy violation / chargeback
    'deactivated'            -- user-initiated account closure
);

CREATE TYPE kyc_status AS ENUM (
    'not_started',
    'pending',               -- documents submitted, under review
    'verified',              -- identity confirmed
    'failed'                 -- verification rejected
);

CREATE TYPE host_type AS ENUM (
    'residential',           -- homeowner / renter with private charger
    'commercial'             -- hotel, restaurant, gas station, etc.
);


-- ------------------------------------------------------------
-- USERS (Identity & Authentication)
-- ------------------------------------------------------------

CREATE TABLE users (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    email               CITEXT          NOT NULL UNIQUE,
    phone               VARCHAR(20)     UNIQUE,
    full_name           VARCHAR(150)    NOT NULL,
    avatar_url          TEXT,

    -- Auth
    password_hash       TEXT,                           -- null if using OAuth only
    email_verified_at   TIMESTAMPTZ,
    phone_verified_at   TIMESTAMPTZ,

    -- Role & Status
    roles               user_role[]     NOT NULL DEFAULT '{driver}',
    account_status      account_status  NOT NULL DEFAULT 'pending_verification',

    -- KYC (required before hosts can receive payouts)
    kyc_status          kyc_status      NOT NULL DEFAULT 'not_started',
    kyc_verified_at     TIMESTAMPTZ,

    -- Stripe Connect (populated when user onboards as a host)
    stripe_customer_id          VARCHAR(100) UNIQUE,    -- for charging drivers
    stripe_connect_account_id   VARCHAR(100) UNIQUE,    -- for paying out hosts

    -- Soft-delete & Timestamps
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email           ON users (email);
CREATE INDEX idx_users_account_status  ON users (account_status);
CREATE INDEX idx_users_roles           ON users USING GIN (roles);  -- query users by role


-- ------------------------------------------------------------
-- DRIVER PROFILES
-- One-to-one extension of users for driving-specific data.
-- Created automatically when a user registers as a driver.
-- ------------------------------------------------------------

CREATE TABLE driver_profiles (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Vehicle info (supports multiple vehicles per driver)
    -- Vehicles stored in a separate table (see below)

    -- Charging preferences
    preferred_plug_types    TEXT[]      DEFAULT '{}',   -- e.g. '{CCS2, NACS, Type2}'
    preferred_min_kw        SMALLINT    DEFAULT 7,      -- minimum acceptable charger speed

    -- Driving stats (denormalized for performance)
    total_sessions          INT         NOT NULL DEFAULT 0,
    total_kwh_consumed      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_spend_cents       BIGINT      NOT NULL DEFAULT 0,  -- stored in cents

    -- Trust & Safety
    is_trusted              BOOLEAN     NOT NULL DEFAULT FALSE,  -- unlocks instant booking
    violation_count         SMALLINT    NOT NULL DEFAULT 0,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_driver_profiles_user UNIQUE (user_id)
);


-- ------------------------------------------------------------
-- DRIVER VEHICLES
-- A driver can register multiple EVs (households with 2 EVs, etc.)
-- ------------------------------------------------------------

CREATE TYPE plug_type AS ENUM (
    'CCS1',         -- North America DC fast
    'CCS2',         -- Europe DC fast
    'NACS',         -- Tesla / North American Charging Standard
    'CHAdeMO',      -- Nissan, older Japanese EVs
    'Type2',        -- European AC (Mennekes)
    'NEMA_14_50',   -- Standard North American 240V outlet
    'NEMA_5_15',    -- Standard 120V outlet (Level 1)
    'J1772'         -- North American AC (Level 1 & 2)
);

CREATE TABLE driver_vehicles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_profile_id   UUID        NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,

    make                VARCHAR(60) NOT NULL,   -- e.g. 'Tesla'
    model               VARCHAR(60) NOT NULL,   -- e.g. 'Model 3'
    year                SMALLINT    NOT NULL,
    color               VARCHAR(40),
    license_plate       VARCHAR(20),
    license_plate_state VARCHAR(5),             -- e.g. 'CA', 'TX'

    -- Plug compatibility
    plug_types          plug_type[] NOT NULL,   -- vehicle may support multiple plugs

    -- Battery capacity (kWh) — used for estimating session cost
    battery_capacity_kwh NUMERIC(6,2),

    is_primary          BOOLEAN     NOT NULL DEFAULT FALSE,  -- default vehicle for bookings
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_vehicles_driver_profile ON driver_vehicles (driver_profile_id);


-- ------------------------------------------------------------
-- HOST PROFILES
-- One-to-one extension of users for hosting-specific data.
-- ------------------------------------------------------------

CREATE TABLE host_profiles (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    host_type               host_type       NOT NULL DEFAULT 'residential',

    -- Business info (commercial hosts only)
    business_name           VARCHAR(200),
    business_registration   VARCHAR(100),   -- EIN / company reg number
    vat_number              VARCHAR(50),

    -- Payout & Financial
    payout_enabled          BOOLEAN         NOT NULL DEFAULT FALSE,
    payout_schedule         VARCHAR(20)     NOT NULL DEFAULT 'weekly',  -- daily | weekly | monthly
    minimum_payout_cents    INT             NOT NULL DEFAULT 2000,       -- $20 minimum

    -- Platform Tier (affects commission rate)
    -- 'standard' = 15% fee, 'pro' = 10% fee (subscription), 'enterprise' = negotiated
    platform_tier           VARCHAR(20)     NOT NULL DEFAULT 'standard',
    commission_rate_pct     NUMERIC(5,2)    NOT NULL DEFAULT 15.00,

    -- Performance stats (denormalized)
    total_listings          SMALLINT        NOT NULL DEFAULT 0,
    total_sessions_hosted   INT             NOT NULL DEFAULT 0,
    total_earnings_cents    BIGINT          NOT NULL DEFAULT 0,
    average_rating          NUMERIC(3,2),   -- e.g. 4.87

    -- Insurance
    -- Platform umbrella policy reference for this host
    insurance_policy_ref    VARCHAR(100),
    insurance_valid_until   DATE,

    -- Trust
    is_superhost            BOOLEAN         NOT NULL DEFAULT FALSE,
    identity_verified       BOOLEAN         NOT NULL DEFAULT FALSE,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_host_profiles_user UNIQUE (user_id)
);

CREATE INDEX idx_host_profiles_host_type     ON host_profiles (host_type);
CREATE INDEX idx_host_profiles_superhost     ON host_profiles (is_superhost);
CREATE INDEX idx_host_profiles_platform_tier ON host_profiles (platform_tier);


-- ------------------------------------------------------------
-- TRIGGER: Auto-update updated_at on all tables
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_driver_profiles_updated_at
    BEFORE UPDATE ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_host_profiles_updated_at
    BEFORE UPDATE ON host_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_driver_vehicles_updated_at
    BEFORE UPDATE ON driver_vehicles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
