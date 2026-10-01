-- ============================================================
-- Migration 017: Accessibility Features, Listing Health &
--                Predicted Availability
-- ============================================================
-- Fills gaps identified in Planning Baseline v2.3:
--
--   1. charger_listings — accessibility_features JSONB column
--      so drivers can filter by wheelchair access, visual
--      impairment aids, lighting, toilet proximity, etc.
--
--   2. listing_health_scores — AI-computed health signals per
--      listing used by the Listing Health Agent (new
--      agent_task_type: listing_health_alert).
--
--   3. listing_availability_predictions — ML-predicted
--      availability probability per listing per hour slot.
--      Powers "97% likely available when you arrive" UX.
--
--   4. family_mode_poi — nearby points of interest cached per
--      listing for "travelling with children" voice filter.
--
--   5. agent_tasks.task_type ENUM extended:
--        listing_health_alert
--        predicted_availability_update
--
-- Depends on: 001–016.
-- ============================================================


-- ============================================================
-- 1. ACCESSIBILITY FEATURES ON LISTINGS
-- Structured JSONB + individual boolean columns for indexed
-- fast filtering on the most common accessibility attributes.
-- ============================================================

ALTER TABLE charger_listings
    -- Indexed fast-filter columns (most queried)
    ADD COLUMN IF NOT EXISTS access_wheelchair        BOOLEAN  NOT NULL DEFAULT FALSE,
    -- Bay is wide enough + surface is accessible for wheelchair users

    ADD COLUMN IF NOT EXISTS access_visual_impairment BOOLEAN  NOT NULL DEFAULT FALSE,
    -- Tactile paving, audio confirmation, high-contrast signage

    ADD COLUMN IF NOT EXISTS access_step_free         BOOLEAN  NOT NULL DEFAULT FALSE,
    -- No steps between parking and charger

    ADD COLUMN IF NOT EXISTS access_covered           BOOLEAN  NOT NULL DEFAULT FALSE,
    -- Weather protection over the bay (shelter / car park roof)

    ADD COLUMN IF NOT EXISTS access_lighting          BOOLEAN  NOT NULL DEFAULT FALSE,
    -- Adequate lighting for evening / overnight access

    ADD COLUMN IF NOT EXISTS access_toilet_nearby     BOOLEAN  NOT NULL DEFAULT FALSE,
    -- Toilet within 100m of bay (important for longer sessions)

    ADD COLUMN IF NOT EXISTS access_family_friendly   BOOLEAN  NOT NULL DEFAULT FALSE,
    -- Play area / restaurant / café within 200m

    ADD COLUMN IF NOT EXISTS access_ev_bay_width_cm   SMALLINT,
    -- Measured bay width in cm (standard = 240cm; accessible = 350cm+)

    -- Freeform JSONB for extended accessibility metadata
    -- e.g. {"audio_guidance":true,"braille_labels":false,"help_button":true}
    ADD COLUMN IF NOT EXISTS accessibility_extras     JSONB    DEFAULT '{}';

-- Partial indexes for the most common accessibility filters
CREATE INDEX IF NOT EXISTS idx_listings_wheelchair
    ON charger_listings (location) WHERE access_wheelchair = TRUE AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_listings_covered
    ON charger_listings (location) WHERE access_covered = TRUE AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_listings_family
    ON charger_listings (location) WHERE access_family_friendly = TRUE AND status = 'published';

COMMENT ON COLUMN charger_listings.access_wheelchair IS
    'Bay and path are accessible for wheelchair users. Host self-declares; verified by Safety Score inspection.';
COMMENT ON COLUMN charger_listings.access_visual_impairment IS
    'Tactile paving, audio confirmation, or high-contrast signage present.';
COMMENT ON COLUMN charger_listings.access_family_friendly IS
    'Play area, restaurant, or café within 200m of the bay.';


-- ============================================================
-- 2. LISTING HEALTH SCORES
-- Written by the AI Listing Health Agent.
-- Surfaces issues the host may not notice:
--   "Your photos are 14 months old"
--   "Arrival instructions cause drop-off after 6pm"
--   "Your price is £0.08 below market average"
-- ============================================================

CREATE TABLE listing_health_scores (
    listing_id              UUID        PRIMARY KEY REFERENCES charger_listings(id) ON DELETE CASCADE,

    -- Overall health (0–100, higher = healthier)
    overall_score           SMALLINT    NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),

    -- Component scores (each 0–100)
    score_photos            SMALLINT    DEFAULT NULL,  -- recency + quantity + quality signal
    score_description       SMALLINT    DEFAULT NULL,  -- completeness, clarity
    score_access_instructions SMALLINT  DEFAULT NULL,  -- presence, detail level
    score_pricing           SMALLINT    DEFAULT NULL,  -- vs. local market average
    score_availability      SMALLINT    DEFAULT NULL,  -- breadth of available windows
    score_response_time     SMALLINT    DEFAULT NULL,  -- host response rate and speed
    score_reviews           SMALLINT    DEFAULT NULL,  -- review volume and recency

    -- AI-generated insight messages (shown in host dashboard)
    -- Array of {type, severity, message, action_label, action_url}
    insights                JSONB       NOT NULL DEFAULT '[]',
    -- Example:
    -- [{"type":"photos_stale","severity":"warning","message":"Your photos are 14 months old. Listings with recent photos get 2.4× more bookings.","action_label":"Update photos","action_url":"/host/listings/{id}/photos"},
    --  {"type":"price_below_market","severity":"info","message":"You are £0.06/kWh below local average. Raising to £0.34/kWh could add £22/month.","action_label":"Adjust price","action_url":"/host/listings/{id}/pricing"}]

    -- Metadata
    last_calculated_at      TIMESTAMPTZ,
    next_check_at           TIMESTAMPTZ,    -- scheduled re-evaluation
    agent_task_id           UUID            REFERENCES agent_tasks(id),

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_health_score   ON listing_health_scores (overall_score);
CREATE INDEX idx_listing_health_next    ON listing_health_scores (next_check_at)
    WHERE next_check_at IS NOT NULL;

CREATE TRIGGER trg_listing_health_updated_at
    BEFORE UPDATE ON listing_health_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 3. LISTING AVAILABILITY PREDICTIONS
-- ML model output: probability a listing will be available
-- for a given hour slot, based on historical booking patterns.
-- Updated nightly by pg_cron + ai-service prediction job.
-- Powers: "97% likely available when you arrive" display.
-- ============================================================

CREATE TABLE listing_availability_predictions (
    id              BIGSERIAL   PRIMARY KEY,
    listing_id      UUID        NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,

    -- The hour slot this prediction covers
    slot_start      TIMESTAMPTZ NOT NULL,   -- e.g. 2026-10-01 09:00:00+00
    slot_end        TIMESTAMPTZ NOT NULL,   -- e.g. 2026-10-01 10:00:00+00

    -- Predicted probability (0.00–1.00)
    availability_probability NUMERIC(4, 3) NOT NULL
        CHECK (availability_probability BETWEEN 0 AND 1),

    -- Confidence in the prediction (based on historical sample size)
    model_confidence NUMERIC(4, 3)  DEFAULT NULL,

    -- How many historical data points were used
    sample_size     INT             DEFAULT NULL,

    -- Model version (for A/B and audit)
    model_version   VARCHAR(20)     DEFAULT 'v1',

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_listing_slot UNIQUE (listing_id, slot_start)
);

CREATE INDEX idx_avail_predictions_listing_slot
    ON listing_availability_predictions (listing_id, slot_start);

CREATE INDEX idx_avail_predictions_slot
    ON listing_availability_predictions (slot_start)
    WHERE availability_probability >= 0.70;   -- fast query for "likely available" slots


-- ============================================================
-- 4. FAMILY MODE POI (Points of Interest near listing)
-- Cached per listing from a POI enrichment job (Google Places /
-- Overpass API). Updated monthly or on listing publish.
-- Used by: voice "travelling with children" filter,
--          AI trip planner family mode suggestions.
-- ============================================================

CREATE TYPE poi_category AS ENUM (
    'toilet',
    'restaurant',
    'cafe',
    'play_area',
    'supermarket',
    'pharmacy',
    'park',
    'hotel',
    'petrol_station'
);

CREATE TABLE listing_pois (
    id              BIGSERIAL       PRIMARY KEY,
    listing_id      UUID            NOT NULL REFERENCES charger_listings(id) ON DELETE CASCADE,

    category        poi_category    NOT NULL,
    name            VARCHAR(200)    NOT NULL,
    distance_metres INT             NOT NULL,
    google_place_id VARCHAR(100),
    lat             NUMERIC(10, 7),
    lng             NUMERIC(10, 7),
    is_accessible   BOOLEAN         DEFAULT NULL,   -- wheelchair accessible

    last_verified_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listing_pois_listing  ON listing_pois (listing_id, category);
CREATE INDEX idx_listing_pois_category ON listing_pois (category, distance_metres);


-- ============================================================
-- 5. EXTEND agent_tasks.task_type ENUM
-- ============================================================

ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'listing_health_alert';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'predicted_availability_update';
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'family_mode_poi_refresh';


-- ============================================================
-- MIGRATION COMPLETE
-- Run after: 016_wearable_commute_agent.sql
-- ============================================================
