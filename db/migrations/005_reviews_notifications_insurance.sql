-- ============================================================
-- Migration 005: Reviews, Notifications, Insurance & Incidents
-- ============================================================
-- Covers:
--   1. Dual-sided reviews (driver reviews host & vice versa)
--   2. Notification events (push, email, SMS)
--   3. Insurance claims & incident reports
--   4. Platform disputes
--   5. Audit log (immutable event trail)
-- ============================================================


-- ============================================================
-- SECTION 1: REVIEWS
-- ============================================================
-- Both sides review each other after a completed booking.
-- Reviews are blind until both parties submit (Airbnb model)
-- to prevent retaliatory ratings.
-- ============================================================

CREATE TYPE review_subject AS ENUM (
    'listing',      -- driver reviews the charger/location
    'driver'        -- host reviews the driver's behaviour
);

CREATE TYPE review_status AS ENUM (
    'pending',      -- submitted but not yet visible (waiting for counterpart)
    'published',    -- both sides submitted OR reveal window expired
    'removed'       -- taken down by moderation
);

CREATE TABLE reviews (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id          UUID            NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,

    -- Who wrote this review
    reviewer_user_id    UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    -- Who / what is being reviewed
    reviewee_user_id    UUID            REFERENCES users(id) ON DELETE RESTRICT,
    listing_id          UUID            REFERENCES charger_listings(id) ON DELETE RESTRICT,
    subject             review_subject  NOT NULL,

    -- Ratings (1–5 scale stored as SMALLINT)
    overall_rating      SMALLINT        NOT NULL,

    -- Sub-ratings for listing reviews (null on driver reviews)
    rating_accuracy     SMALLINT,   -- did the listing match the description?
    rating_reliability  SMALLINT,   -- was the charger working as advertised?
    rating_location     SMALLINT,   -- easy to find / access?
    rating_value        SMALLINT,   -- fair price for kWh delivered?
    rating_communication SMALLINT,  -- host responsiveness

    -- Sub-ratings for driver reviews (null on listing reviews)
    rating_behaviour    SMALLINT,   -- was the driver respectful of property?
    rating_timeliness   SMALLINT,   -- did they arrive and leave on time?

    -- Written review
    comment             TEXT,

    -- Blind review mechanic
    status              review_status   NOT NULL DEFAULT 'pending',
    revealed_at         TIMESTAMPTZ,    -- when both sides submitted or window expired

    -- Moderation
    flagged_at          TIMESTAMPTZ,
    moderation_note     TEXT,

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- One review per subject per booking per reviewer
    CONSTRAINT uq_review_per_booking_subject
        UNIQUE (booking_id, reviewer_user_id, subject),

    -- Enforce valid rating range
    CONSTRAINT chk_overall_rating       CHECK (overall_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_accuracy      CHECK (rating_accuracy IS NULL      OR rating_accuracy BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_reliability   CHECK (rating_reliability IS NULL   OR rating_reliability BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_location      CHECK (rating_location IS NULL      OR rating_location BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_value         CHECK (rating_value IS NULL         OR rating_value BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_communication CHECK (rating_communication IS NULL OR rating_communication BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_behaviour     CHECK (rating_behaviour IS NULL     OR rating_behaviour BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_timeliness    CHECK (rating_timeliness IS NULL    OR rating_timeliness BETWEEN 1 AND 5)
);

CREATE INDEX idx_reviews_booking         ON reviews (booking_id);
CREATE INDEX idx_reviews_listing         ON reviews (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX idx_reviews_reviewee        ON reviews (reviewee_user_id) WHERE reviewee_user_id IS NOT NULL;
CREATE INDEX idx_reviews_status          ON reviews (status);

CREATE TRIGGER trg_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- TRIGGER: Recalculate listing average_rating after review
-- Fires on INSERT or UPDATE of a published listing review.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_listing_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.subject = 'listing' AND NEW.status = 'published' AND NEW.listing_id IS NOT NULL THEN
        UPDATE charger_listings
        SET
            average_rating = (
                SELECT ROUND(AVG(overall_rating)::NUMERIC, 2)
                FROM   reviews
                WHERE  listing_id = NEW.listing_id
                  AND  subject    = 'listing'
                  AND  status     = 'published'
            ),
            review_count = (
                SELECT COUNT(*)
                FROM   reviews
                WHERE  listing_id = NEW.listing_id
                  AND  subject    = 'listing'
                  AND  status     = 'published'
            )
        WHERE id = NEW.listing_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_listing_rating
    AFTER INSERT OR UPDATE OF status ON reviews
    FOR EACH ROW EXECUTE FUNCTION refresh_listing_rating();


-- ------------------------------------------------------------
-- TRIGGER: Recalculate host average_rating after review
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_host_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- A listing review indirectly rates the host
    IF NEW.subject = 'listing' AND NEW.status = 'published' AND NEW.listing_id IS NOT NULL THEN
        UPDATE host_profiles hp
        SET average_rating = (
            SELECT ROUND(AVG(r.overall_rating)::NUMERIC, 2)
            FROM   reviews r
            JOIN   charger_listings cl ON cl.id = r.listing_id
            WHERE  cl.host_profile_id = hp.id
              AND  r.subject          = 'listing'
              AND  r.status           = 'published'
        )
        FROM charger_listings cl
        WHERE cl.id = NEW.listing_id
          AND hp.id = cl.host_profile_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_host_rating
    AFTER INSERT OR UPDATE OF status ON reviews
    FOR EACH ROW EXECUTE FUNCTION refresh_host_rating();


-- ============================================================
-- SECTION 2: NOTIFICATIONS
-- ============================================================
-- Stores all outbound notification events for the platform.
-- The delivery worker reads this table and dispatches via
-- push (FCM/APNs), email (SendGrid), or SMS (Twilio).
-- ============================================================

CREATE TYPE notification_channel AS ENUM (
    'push',         -- mobile push notification
    'email',
    'sms',
    'in_app'        -- in-app notification bell
);

CREATE TYPE notification_type AS ENUM (
    -- Booking lifecycle
    'booking_confirmed',
    'booking_cancelled',
    'booking_reminder_1h',      -- 1 hour before session
    'booking_reminder_15m',     -- 15 min before session
    'booking_no_show_warning',

    -- Session events
    'session_started',
    'session_completed',
    'idle_fee_warning',         -- car fully charged, idle fees starting
    'idle_fee_applied',
    'charger_fault_detected',

    -- Payments
    'payment_captured',
    'payment_refunded',
    'payout_initiated',
    'payout_completed',
    'payout_failed',

    -- Host management
    'new_booking_request',
    'booking_auto_approved',
    'review_received',
    'listing_under_review',

    -- Trust & Safety
    'identity_verified',
    'identity_failed',
    'account_suspended',
    'insurance_claim_opened',
    'incident_reported',

    -- Marketing / Platform
    'welcome',
    'promotional',
    'policy_update'
);

CREATE TYPE notification_delivery_status AS ENUM (
    'queued',
    'sent',
    'delivered',
    'failed',
    'skipped'       -- user opted out of this channel
);

CREATE TABLE notifications (
    id                  UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID                            NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    channel             notification_channel            NOT NULL,
    type                notification_type               NOT NULL,

    -- Content
    title               VARCHAR(200)                    NOT NULL,
    body                TEXT                            NOT NULL,
    action_url          TEXT,                           -- deep-link or web URL on tap
    image_url           TEXT,

    -- Delivery
    delivery_status     notification_delivery_status    NOT NULL DEFAULT 'queued',
    delivered_at        TIMESTAMPTZ,
    failure_reason      TEXT,
    retry_count         SMALLINT                        NOT NULL DEFAULT 0,

    -- Device targeting (push)
    device_token        TEXT,                           -- FCM/APNs token
    device_platform     VARCHAR(10),                    -- 'ios' | 'android' | 'web'

    -- Read state (in-app channel)
    read_at             TIMESTAMPTZ,

    -- Context reference (what triggered this notification)
    related_booking_id  UUID    REFERENCES bookings(id),
    related_session_id  UUID    REFERENCES charging_sessions(id),

    created_at          TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
    scheduled_for       TIMESTAMPTZ                     NOT NULL DEFAULT NOW()  -- allows delayed sending
);

CREATE INDEX idx_notifications_user         ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_status       ON notifications (delivery_status) WHERE delivery_status = 'queued';
CREATE INDEX idx_notifications_scheduled    ON notifications (scheduled_for)   WHERE delivery_status = 'queued';
CREATE INDEX idx_notifications_type         ON notifications (type);


-- ------------------------------------------------------------
-- USER NOTIFICATION PREFERENCES
-- Per-channel, per-type opt-out settings.
-- ------------------------------------------------------------

CREATE TABLE notification_preferences (
    id          UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel     notification_channel    NOT NULL,
    type        notification_type       NOT NULL,
    enabled     BOOLEAN                 NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_notif_pref_user_channel_type UNIQUE (user_id, channel, type)
);

CREATE INDEX idx_notif_prefs_user ON notification_preferences (user_id);


-- ============================================================
-- SECTION 3: INSURANCE CLAIMS & INCIDENT REPORTS
-- ============================================================

CREATE TYPE incident_type AS ENUM (
    'property_damage',      -- damage to host property / charger
    'vehicle_damage',       -- damage to driver's EV
    'personal_injury',      -- slip/trip/fall
    'electrical_fault',     -- surge, arc flash, fire
    'theft',                -- cable/hardware theft
    'trespassing',          -- driver overstayed or broke access rules
    'harassment',           -- between driver and host
    'charger_vandalism',
    'other'
);

CREATE TYPE incident_severity AS ENUM (
    'low',          -- minor inconvenience, no financial claim
    'medium',       -- property damage, claim likely under $500
    'high',         -- significant damage, injury, or theft
    'critical'      -- fire, serious injury, police involvement
);

CREATE TYPE incident_status AS ENUM (
    'reported',
    'under_investigation',
    'evidence_requested',
    'resolved_no_claim',
    'claim_filed',
    'claim_approved',
    'claim_denied',
    'closed'
);

CREATE TABLE incident_reports (
    id                      UUID                PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who reported it
    reported_by_user_id     UUID                NOT NULL REFERENCES users(id),

    -- What booking / session it relates to
    booking_id              UUID                REFERENCES bookings(id),
    session_id              UUID                REFERENCES charging_sessions(id),
    listing_id              UUID                REFERENCES charger_listings(id),

    -- Classification
    incident_type           incident_type       NOT NULL,
    severity                incident_severity   NOT NULL DEFAULT 'low',
    status                  incident_status     NOT NULL DEFAULT 'reported',

    -- Description
    title                   VARCHAR(200)        NOT NULL,
    description             TEXT                NOT NULL,

    -- Evidence
    photo_urls              TEXT[]              DEFAULT '{}',
    video_urls              TEXT[]              DEFAULT '{}',
    supporting_docs         TEXT[]              DEFAULT '{}',  -- police report, repair quote

    -- Location of incident (may differ from listing if occurred nearby)
    incident_location       GEOGRAPHY(POINT, 4326),

    -- Assigned platform agent
    assigned_to_user_id     UUID                REFERENCES users(id),
    investigation_notes     TEXT,
    resolution_notes        TEXT,

    -- Financial
    estimated_damage_cents  INT                 DEFAULT 0,
    actual_damage_cents     INT                 DEFAULT 0,

    -- Timestamps
    incident_occurred_at    TIMESTAMPTZ,
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_reported_by  ON incident_reports (reported_by_user_id);
CREATE INDEX idx_incidents_booking      ON incident_reports (booking_id);
CREATE INDEX idx_incidents_status       ON incident_reports (status);
CREATE INDEX idx_incidents_severity     ON incident_reports (severity);
CREATE INDEX idx_incidents_location     ON incident_reports USING GIST (incident_location)
    WHERE incident_location IS NOT NULL;

CREATE TRIGGER trg_incident_reports_updated_at
    BEFORE UPDATE ON incident_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- INSURANCE CLAIMS
-- Formal insurance claim filed after an incident is escalated.
-- Linked to the platform umbrella policy or host policy.
-- ------------------------------------------------------------

CREATE TYPE claim_status AS ENUM (
    'draft',
    'submitted',
    'acknowledged',         -- insurer acknowledged receipt
    'under_review',
    'additional_info_needed',
    'approved',
    'partially_approved',
    'denied',
    'paid_out',
    'closed'
);

CREATE TYPE insurance_policy_type AS ENUM (
    'platform_umbrella',    -- Zipgrid's master $1M–$5M CGL policy
    'host_homeowners',      -- host's own homeowner/renters policy
    'host_commercial',      -- host's business liability policy
    'driver_auto'           -- driver's personal auto policy
);

CREATE TABLE insurance_claims (
    id                      UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_report_id      UUID                    NOT NULL REFERENCES incident_reports(id),

    -- Claimant
    claimant_user_id        UUID                    NOT NULL REFERENCES users(id),

    -- Policy
    policy_type             insurance_policy_type   NOT NULL,
    policy_reference        VARCHAR(100),           -- policy number
    insurer_name            VARCHAR(150),

    -- Status
    status                  claim_status            NOT NULL DEFAULT 'draft',

    -- Claim amounts
    claimed_amount_cents    INT                     NOT NULL DEFAULT 0,
    approved_amount_cents   INT                     DEFAULT 0,
    paid_amount_cents       INT                     DEFAULT 0,
    deductible_cents        INT                     DEFAULT 0,

    -- External claim reference
    insurer_claim_ref       VARCHAR(100),           -- insurer's own claim ID
    insurer_adjuster_name   VARCHAR(150),
    insurer_adjuster_email  CITEXT,
    insurer_adjuster_phone  VARCHAR(20),

    -- Documents
    claim_form_url          TEXT,
    adjuster_report_url     TEXT,

    -- Notes
    internal_notes          TEXT,
    denial_reason           TEXT,

    -- Timestamps
    submitted_at            TIMESTAMPTZ,
    approved_at             TIMESTAMPTZ,
    paid_out_at             TIMESTAMPTZ,

    created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insurance_claims_incident  ON insurance_claims (incident_report_id);
CREATE INDEX idx_insurance_claims_claimant  ON insurance_claims (claimant_user_id);
CREATE INDEX idx_insurance_claims_status    ON insurance_claims (status);

CREATE TRIGGER trg_insurance_claims_updated_at
    BEFORE UPDATE ON insurance_claims
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SECTION 4: PLATFORM DISPUTES
-- ============================================================
-- Formal dispute process for billing or booking disagreements.
-- Separate from insurance (handles refund/chargeback logic).
-- ============================================================

CREATE TYPE dispute_type AS ENUM (
    'billing_overcharge',       -- driver charged more than expected
    'charger_not_working',      -- listing misrepresented functionality
    'host_no_access',           -- driver couldn't access charger
    'driver_damage',            -- host claims driver damaged property
    'unauthorized_overstay',    -- driver stayed past booking end
    'fraudulent_listing',
    'other'
);

CREATE TYPE dispute_status AS ENUM (
    'open',
    'platform_reviewing',
    'awaiting_driver_response',
    'awaiting_host_response',
    'resolved_for_driver',
    'resolved_for_host',
    'resolved_split',           -- partial refund compromise
    'escalated_to_insurer',
    'closed'
);

CREATE TABLE disputes (
    id                      UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id              UUID                NOT NULL REFERENCES bookings(id),
    transaction_id          UUID                REFERENCES transactions(id),

    -- Who raised it
    raised_by_user_id       UUID                NOT NULL REFERENCES users(id),
    against_user_id         UUID                NOT NULL REFERENCES users(id),

    -- Type & Status
    dispute_type            dispute_type        NOT NULL,
    status                  dispute_status      NOT NULL DEFAULT 'open',

    -- Description
    title                   VARCHAR(200)        NOT NULL,
    description             TEXT                NOT NULL,
    evidence_urls           TEXT[]              DEFAULT '{}',

    -- Platform resolution
    assigned_agent_id       UUID                REFERENCES users(id),
    resolution_notes        TEXT,
    resolution_amount_cents INT                 DEFAULT 0,  -- refund if any

    -- Stripe chargeback reference
    stripe_dispute_id       VARCHAR(100),

    -- Timestamps
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_booking       ON disputes (booking_id);
CREATE INDEX idx_disputes_raised_by     ON disputes (raised_by_user_id);
CREATE INDEX idx_disputes_status        ON disputes (status);

CREATE TRIGGER trg_disputes_updated_at
    BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SECTION 5: AUDIT LOG
-- ============================================================
-- Immutable append-only event trail for compliance, debugging,
-- and financial auditing. No updates or deletes ever allowed.
-- ============================================================

CREATE TYPE audit_action AS ENUM (
    -- User
    'user_registered',
    'user_email_verified',
    'user_kyc_status_changed',
    'user_role_changed',
    'user_suspended',
    'user_deactivated',

    -- Listings
    'listing_created',
    'listing_activated',
    'listing_paused',
    'listing_deactivated',
    'listing_price_changed',

    -- Bookings
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',

    -- Sessions
    'session_started',
    'session_completed',
    'session_faulted',

    -- Payments
    'payment_hold_placed',
    'payment_captured',
    'payment_refunded',
    'payout_initiated',
    'payout_paid',

    -- Trust & Safety
    'review_published',
    'review_removed',
    'incident_reported',
    'claim_submitted',
    'claim_approved',
    'claim_denied',
    'dispute_opened',
    'dispute_resolved',

    -- Admin
    'admin_override',
    'platform_config_changed'
);

CREATE TABLE audit_log (
    id              BIGSERIAL       PRIMARY KEY,    -- sequential for ordering
    occurred_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Who performed the action
    actor_user_id   UUID            REFERENCES users(id),
    actor_ip        INET,
    actor_user_agent TEXT,

    -- What happened
    action          audit_action    NOT NULL,

    -- What it affected
    entity_type     VARCHAR(60)     NOT NULL,   -- 'booking', 'charger_listing', etc.
    entity_id       UUID,

    -- Before/after state snapshot (for financial & config changes)
    old_values      JSONB,
    new_values      JSONB,

    -- Additional context
    metadata        JSONB           DEFAULT '{}'
);

-- Audit log is append-only — only allow SELECT + INSERT
-- Revoke UPDATE and DELETE at the DB role level in production:
-- REVOKE UPDATE, DELETE ON audit_log FROM app_role;

CREATE INDEX idx_audit_log_actor      ON audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_log_entity     ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_action     ON audit_log (action);
CREATE INDEX idx_audit_log_occurred   ON audit_log (occurred_at DESC);
-- GIN index for querying inside JSONB metadata
CREATE INDEX idx_audit_log_metadata   ON audit_log USING GIN (metadata);
