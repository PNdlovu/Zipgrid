-- ============================================================
-- Migration 003: Charger Listings, Availability & Pricing
-- ============================================================
-- This is the spatial core of the platform.
-- Each listing stores a lat/lng NUMERIC pair for proximity search.
-- distance calculations (ST_DWithin, ST_Distance) in meters.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE listing_status AS ENUM (
    'draft',            -- host is still setting up
    'active',           -- visible to drivers & bookable
    'paused',           -- host temporarily hidden it
    'under_review',     -- flagged by platform for inspection
    'deactivated'       -- permanently removed
);

CREATE TYPE charger_level AS ENUM (
    'level_1',          -- 120V AC ~1.4kW  (NEMA 5-15)
    'level_2',          -- 240V AC 7–19.2kW (J1772, Type 2)
    'dc_fast',          -- 50–350kW (CCS, CHAdeMO, NACS)
    'dc_ultra_fast'     -- 150–350kW+ (High-Power DC)
);

CREATE TYPE pricing_model AS ENUM (
    'per_kwh',          -- price per kilowatt-hour consumed (most fair)
    'per_hour',         -- price per hour connected
    'per_session',      -- flat fee per booking regardless of energy/time
    'hybrid'            -- base session fee + per kWh rate on top
);

CREATE TYPE access_type AS ENUM (
    'always_open',      -- no gate, no code needed
    'gate_code',        -- numeric or alphanumeric code
    'buzz_in',          -- host must remotely open gate
    'key_pickup',       -- physical key collection required
    'app_unlock'        -- NFC / BLE unlock via Zipgrid app
);


-- ------------------------------------------------------------
-- CHARGER LISTINGS
-- The primary marketplace entity — one row per charger unit.
-- A single host can have many listings (multi-charger setup).
-- ------------------------------------------------------------

CREATE TABLE charger_listings (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    host_profile_id         UUID            NOT NULL REFERENCES host_profiles(id) ON DELETE RESTRICT,

    -- Basic Info
    title                   VARCHAR(120)    NOT NULL,       -- e.g. "Fast Level 2 in Quiet Driveway"
    description             TEXT,
    status                  listing_status  NOT NULL DEFAULT 'draft',

    -- --------------------------------------------------------
    -- LOCATION  (lat/lng decimal columns; earthdistance for radius queries)
    -- --------------------------------------------------------
    -- Human-readable address
    address_line1           VARCHAR(200)    NOT NULL,
    address_line2           VARCHAR(100),
    city                    VARCHAR(100)    NOT NULL,
    state_province          VARCHAR(100)    NOT NULL,
    postal_code             VARCHAR(20)     NOT NULL,
    country_code            CHAR(2)         NOT NULL DEFAULT 'US',  -- ISO 3166-1 alpha-2

    -- Coords used for proximity search (earthdistance extension)
    latitude                NUMERIC(10, 7)  NOT NULL,
    longitude               NUMERIC(10, 7)  NOT NULL,

    -- --------------------------------------------------------
    -- CHARGER HARDWARE SPECS
    -- --------------------------------------------------------
    charger_level           charger_level   NOT NULL,
    plug_types              plug_type[]     NOT NULL,       -- e.g. '{CCS1, J1772}'
    max_power_kw            NUMERIC(6,1)    NOT NULL,       -- e.g. 11.5
    voltage                 SMALLINT,                       -- e.g. 240
    amperage                SMALLINT,                       -- e.g. 48
    num_ports               SMALLINT        NOT NULL DEFAULT 1,

    -- Hardware & Network
    charger_brand           VARCHAR(80),                    -- e.g. 'ChargePoint', 'Wallbox'
    charger_model           VARCHAR(80),
    ocpp_charge_point_id    VARCHAR(100) UNIQUE,            -- OCPP identity string
    is_smart_charger        BOOLEAN         NOT NULL DEFAULT FALSE,  -- OCPP capable
    is_networked            BOOLEAN         NOT NULL DEFAULT FALSE,  -- real-time telemetry

    -- --------------------------------------------------------
    -- PRICING
    -- --------------------------------------------------------
    pricing_model           pricing_model   NOT NULL DEFAULT 'per_kwh',
    price_per_kwh_cents     INT,            -- e.g. 30 = $0.30/kWh
    price_per_hour_cents    INT,            -- e.g. 250 = $2.50/hr
    price_per_session_cents INT,            -- e.g. 500 = $5.00 flat
    idle_fee_per_min_cents  INT             NOT NULL DEFAULT 10,  -- $0.10/min overstay

    -- Peak pricing (optional surcharge on top of base rate)
    peak_surcharge_pct      NUMERIC(5,2)    DEFAULT 0.00,   -- e.g. 25.00 = 25% extra
    peak_hours_start        TIME,                           -- e.g. '17:00'
    peak_hours_end          TIME,                           -- e.g. '21:00'

    -- --------------------------------------------------------
    -- ACCESS & AMENITIES
    -- --------------------------------------------------------
    access_type             access_type     NOT NULL DEFAULT 'always_open',
    access_instructions     TEXT,           -- encrypted at app level before storage
    wifi_available          BOOLEAN         NOT NULL DEFAULT FALSE,
    restroom_available      BOOLEAN         NOT NULL DEFAULT FALSE,
    shelter_available       BOOLEAN         NOT NULL DEFAULT FALSE,  -- covered/garage
    lighting_available      BOOLEAN         NOT NULL DEFAULT FALSE,
    wheelchair_accessible   BOOLEAN         NOT NULL DEFAULT FALSE,
    ev_parking_only         BOOLEAN         NOT NULL DEFAULT FALSE,  -- reserved EV spot

    -- Amenity tags (flexible, driver-filterable)
    amenity_tags            TEXT[]          DEFAULT '{}',
    -- e.g. '{coffee_shop_nearby, restaurant_onsite, lounge_access}'

    -- --------------------------------------------------------
    -- PHOTOS
    -- --------------------------------------------------------
    -- Array of CDN URLs; ordered (first = cover photo).
    photo_urls              TEXT[]          DEFAULT '{}',

    -- --------------------------------------------------------
    -- BOOKING SETTINGS
    -- --------------------------------------------------------
    instant_book_enabled    BOOLEAN         NOT NULL DEFAULT TRUE,
    min_booking_hours       NUMERIC(4,1)    NOT NULL DEFAULT 0.5,    -- 30 min minimum
    max_booking_hours       NUMERIC(4,1)    NOT NULL DEFAULT 8.0,
    advance_booking_days    SMALLINT        NOT NULL DEFAULT 14,     -- book up to 14 days ahead
    buffer_minutes          SMALLINT        NOT NULL DEFAULT 15,     -- gap between bookings

    -- --------------------------------------------------------
    -- STATS (denormalized counters — updated by triggers)
    -- --------------------------------------------------------
    total_bookings          INT             NOT NULL DEFAULT 0,
    total_kwh_delivered     NUMERIC(12, 2)  NOT NULL DEFAULT 0.00,
    total_revenue_cents     BIGINT          NOT NULL DEFAULT 0,
    average_rating          NUMERIC(3, 2),
    review_count            INT             NOT NULL DEFAULT 0,

    -- --------------------------------------------------------
    -- METADATA
    -- --------------------------------------------------------
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------

-- B-tree on lat/lng for bounding-box proximity pre-filter
CREATE INDEX idx_charger_listings_location
    ON charger_listings (latitude, longitude);

-- Composite index for the most common filter combination:
-- "active listings of a given charger level"
CREATE INDEX idx_charger_listings_status_level
    ON charger_listings (status, charger_level);

-- GIN index for plug type array filtering
-- e.g. WHERE plug_types @> '{CCS1}'
CREATE INDEX idx_charger_listings_plug_types
    ON charger_listings USING GIN (plug_types);

-- GIN index for amenity tag filtering
CREATE INDEX idx_charger_listings_amenity_tags
    ON charger_listings USING GIN (amenity_tags);

-- Host lookup
CREATE INDEX idx_charger_listings_host
    ON charger_listings (host_profile_id);

-- Partial index: only active listings (most queries filter on this)
CREATE INDEX idx_charger_listings_active
    ON charger_listings (id)
    WHERE status = 'active';

-- OCPP lookups (WebSocket central system needs fast lookup by OCPP ID)
CREATE INDEX idx_charger_listings_ocpp_id
    ON charger_listings (ocpp_charge_point_id)
    WHERE ocpp_charge_point_id IS NOT NULL;



-- updated_at trigger (reuses function from migration 002)
CREATE TRIGGER trg_charger_listings_updated_at
    BEFORE UPDATE ON charger_listings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- LISTING AVAILABILITY SCHEDULES
-- Recurring weekly schedule per listing.
-- e.g. Host works Mon-Fri, charger free 8am-6pm those days.
-- ------------------------------------------------------------

CREATE TYPE day_of_week AS ENUM (
    'monday', 'tuesday', 'wednesday', 'thursday',
    'friday', 'saturday', 'sunday'
);

CREATE TABLE listing_availability_schedules (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id          UUID        NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,

    day_of_week         day_of_week NOT NULL,
    open_time           TIME        NOT NULL,   -- e.g. 08:00
    close_time          TIME        NOT NULL,   -- e.g. 18:00
    is_available        BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Overridden price for this window (null = use listing base price)
    override_price_per_kwh_cents    INT,
    override_price_per_hour_cents   INT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One rule per day per listing
    CONSTRAINT uq_schedule_listing_day UNIQUE (listing_id, day_of_week),
    CONSTRAINT chk_schedule_times CHECK (close_time > open_time)
);

CREATE INDEX idx_availability_schedules_listing
    ON listing_availability_schedules (listing_id);


-- ------------------------------------------------------------
-- LISTING BLACKOUT DATES
-- Host blocks specific dates (holidays, maintenance, vacations).
-- Takes precedence over recurring schedule.
-- ------------------------------------------------------------

CREATE TABLE listing_blackout_dates (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id          UUID        NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,

    blackout_date       DATE        NOT NULL,
    reason              VARCHAR(200),           -- internal note for host

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_blackout_listing_date UNIQUE (listing_id, blackout_date)
);

CREATE INDEX idx_blackout_dates_listing_date
    ON listing_blackout_dates (listing_id, blackout_date);


-- ------------------------------------------------------------
-- LISTING PHOTOS (normalized alternative to array column)
-- Supports ordering, soft-delete, and moderation metadata.
-- ------------------------------------------------------------

CREATE TABLE listing_photos (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id          UUID        NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,

    cdn_url             TEXT        NOT NULL,
    thumbnail_url       TEXT,
    display_order       SMALLINT    NOT NULL DEFAULT 0,
    caption             VARCHAR(200),
    is_cover            BOOLEAN     NOT NULL DEFAULT FALSE,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_photos_listing ON listing_photos (listing_id, display_order);

-- Ensure only one cover photo per listing
CREATE UNIQUE INDEX idx_listing_photos_one_cover
    ON listing_photos (listing_id)
    WHERE is_cover = TRUE;


-- Attach updated_at triggers
CREATE TRIGGER trg_listing_photos_updated_at
    BEFORE UPDATE ON listing_photos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
