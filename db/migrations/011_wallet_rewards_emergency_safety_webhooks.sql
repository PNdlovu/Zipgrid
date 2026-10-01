-- ============================================================
-- Migration 011: Wallet, Rewards, Emergency, Safety Scores, Webhooks
-- ============================================================
-- Covers Modules I, J, K, M, R
--
-- Money rule: ALL monetary values stored as pence (INT). Never floats.
-- Points rule: points stored as INT (whole numbers only).
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE wallet_tx_type AS ENUM (
    'topup',            -- driver topped up via Stripe
    'session_payment',  -- wallet debited for a charging session
    'refund',           -- session refund credited back to wallet
    'reward_redemption',-- loyalty points redeemed as wallet credit
    'promotional',      -- admin-issued promotional credit
    'adjustment',       -- manual admin correction
    'withdrawal'        -- refund to original payment method
);

CREATE TYPE reward_action AS ENUM (
    'session_completed',    -- driver completed a charging session
    'host_session_earned',  -- host earned from a session
    'review_submitted',     -- user left a verified review
    'referral_friend',      -- referred friend completed first booking
    'welcome_bonus',        -- first booking on platform
    'birthday_bonus',       -- charged during birthday month
    'off_peak_bonus',       -- charged during off-peak hours
    'streak_bonus',         -- 4-week consecutive charging streak
    'admin_grant',          -- manually awarded by platform
    'redemption'            -- points redeemed (negative amount)
);

CREATE TYPE reward_tier AS ENUM (
    'standard',
    'silver',
    'gold',
    'platinum'
);

CREATE TYPE emergency_status AS ENUM (
    'searching',    -- looking for available hosts
    'host_alerted', -- SOS sent to nearest hosts
    'accepted',     -- host accepted
    'booking_created',
    'expired',      -- no host responded within 5 minutes
    'cancelled'
);

CREATE TYPE safety_component AS ENUM (
    'charger_age',
    'rcd_protection',
    'electrician_installed',
    'ocpp_fault_rate',
    'driver_complaints',
    'platform_inspection'
);

CREATE TYPE webhook_event_type AS ENUM (
    'session.started',
    'session.completed',
    'booking.confirmed',
    'booking.cancelled',
    'payout.paid',
    'listing.published',
    'charger.faulted',
    'emergency.accepted'
);

CREATE TYPE webhook_delivery_status AS ENUM (
    'pending',
    'delivered',
    'failed',
    'retrying'
);


-- ------------------------------------------------------------
-- MODULE I: WALLET
-- Server-side wallet using Stripe Customer Balance.
-- One wallet per user (created lazily on first top-up).
-- ------------------------------------------------------------

CREATE TABLE wallet_balances (
    user_id             UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_pence       INT         NOT NULL DEFAULT 0 CHECK (balance_pence >= 0),
    pending_pence       INT         NOT NULL DEFAULT 0 CHECK (pending_pence >= 0),

    -- Auto top-up settings
    auto_topup_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
    auto_topup_threshold_pence  INT DEFAULT 500,   -- top up when balance < £5
    auto_topup_amount_pence     INT DEFAULT 2000,  -- top up by £20

    -- Stripe Customer Balance reference
    stripe_customer_id  VARCHAR(100),

    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_transactions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type            wallet_tx_type  NOT NULL,

    -- Amount in pence (positive = credit, negative = debit)
    amount_pence    INT             NOT NULL,

    -- Balance snapshot after this transaction
    balance_after_pence INT         NOT NULL,

    -- References
    booking_id      UUID            REFERENCES bookings(id),
    stripe_pi_id    VARCHAR(100),   -- for topup/withdrawal
    description     TEXT            NOT NULL DEFAULT '',

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_txns_user     ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX idx_wallet_txns_booking  ON wallet_transactions (booking_id) WHERE booking_id IS NOT NULL;


-- ------------------------------------------------------------
-- MODULE J: REWARDS & LOYALTY
-- ------------------------------------------------------------

-- All time-series points events (append-only ledger)
CREATE TABLE reward_points (
    id              BIGSERIAL           PRIMARY KEY,
    user_id         UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action          reward_action       NOT NULL,
    points          INT                 NOT NULL,           -- positive = earn, negative = redeem
    multiplier      NUMERIC(4,2)        NOT NULL DEFAULT 1.00,

    -- What generated this award
    booking_id      UUID                REFERENCES bookings(id),
    session_id      UUID                REFERENCES charging_sessions(id),
    description     TEXT,

    expires_at      TIMESTAMPTZ,        -- 12 months from earn date for inactive accounts
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reward_points_user      ON reward_points (user_id, created_at DESC);
CREATE INDEX idx_reward_points_expiry    ON reward_points (expires_at) WHERE expires_at IS NOT NULL;

-- Denormalised totals per user (updated by trigger)
CREATE TABLE reward_balances (
    user_id             UUID            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_points        INT             NOT NULL DEFAULT 0 CHECK (total_points >= 0),
    lifetime_points     INT             NOT NULL DEFAULT 0,
    current_tier        reward_tier     NOT NULL DEFAULT 'standard',
    tier_qualifying_pts INT             NOT NULL DEFAULT 0, -- rolling 12-month points
    tier_reviewed_at    TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Badges earned
CREATE TABLE reward_badges (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_type  VARCHAR(60) NOT NULL,
    -- e.g. 'co2_100kg', 'kwh_500', 'streak_4week', 'emergency_host_3'
    earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_badge_user_type UNIQUE (user_id, badge_type)
);

CREATE INDEX idx_reward_badges_user ON reward_badges (user_id);

-- Trigger: keep reward_balances in sync after each points row
CREATE OR REPLACE FUNCTION update_reward_balance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO reward_balances (user_id, total_points, lifetime_points, updated_at)
    VALUES (
        NEW.user_id,
        GREATEST(0, NEW.points),
        CASE WHEN NEW.points > 0 THEN NEW.points ELSE 0 END,
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        total_points    = GREATEST(0, reward_balances.total_points + NEW.points),
        lifetime_points = reward_balances.lifetime_points + CASE WHEN NEW.points > 0 THEN NEW.points ELSE 0 END,
        updated_at      = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_reward_balance
    AFTER INSERT ON reward_points
    FOR EACH ROW EXECUTE FUNCTION update_reward_balance();


-- ------------------------------------------------------------
-- MODULE K: EMERGENCY CHARGING
-- ------------------------------------------------------------

CREATE TABLE emergency_sessions (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_user_id      UUID                NOT NULL REFERENCES users(id),
    vehicle_id          UUID                REFERENCES driver_vehicles(id),

    -- Driver state at request time
    battery_pct         SMALLINT            NOT NULL CHECK (battery_pct BETWEEN 1 AND 100),
    current_lat         NUMERIC(10,7)       NOT NULL,
    current_lng         NUMERIC(10,7)       NOT NULL,
    current_location    GEOGRAPHY(POINT, 4326) NOT NULL,
    max_range_metres    INT                 NOT NULL,  -- calculated driveable range

    -- Status
    status              emergency_status    NOT NULL DEFAULT 'searching',

    -- Which hosts were alerted
    alerted_listing_ids UUID[]              DEFAULT '{}',
    accepted_listing_id UUID                REFERENCES charger_listings(id),
    resulting_booking_id UUID               REFERENCES bookings(id),

    -- Fee waiver
    platform_fee_waived BOOLEAN             NOT NULL DEFAULT TRUE,

    expires_at          TIMESTAMPTZ         NOT NULL,   -- 5 minutes from creation
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emergency_driver   ON emergency_sessions (driver_user_id);
CREATE INDEX idx_emergency_status   ON emergency_sessions (status) WHERE status = 'searching';
CREATE INDEX idx_emergency_location ON emergency_sessions USING GIST (current_location);

CREATE TRIGGER trg_emergency_updated_at
    BEFORE UPDATE ON emergency_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- MODULE M: SAFETY SCORES
-- ------------------------------------------------------------

CREATE TABLE safety_scores (
    listing_id          UUID        PRIMARY KEY REFERENCES charger_listings(id) ON DELETE CASCADE,

    -- Composite score (0–100)
    overall_score       SMALLINT    NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),

    -- Component scores (each 0–100, weighted in app layer)
    score_charger_age           SMALLINT DEFAULT 0,  -- 20% weight
    score_rcd_protection        SMALLINT DEFAULT 0,  -- 15% weight
    score_electrician_installed SMALLINT DEFAULT 0,  -- 15% weight
    score_ocpp_fault_rate       SMALLINT DEFAULT 0,  -- 20% weight
    score_driver_complaints     SMALLINT DEFAULT 0,  -- 15% weight
    score_platform_inspection   SMALLINT DEFAULT 0,  -- 15% weight

    -- Host-supplied checklist answers (set during onboarding / host portal)
    has_rcd_protection      BOOLEAN DEFAULT NULL,
    is_electrician_installed BOOLEAN DEFAULT NULL,
    charger_install_year    SMALLINT DEFAULT NULL,

    -- Auto-pause tracking
    auto_paused         BOOLEAN NOT NULL DEFAULT FALSE,
    auto_paused_at      TIMESTAMPTZ,
    auto_pause_reason   TEXT,

    last_calculated_at  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_safety_scores_overall   ON safety_scores (overall_score);
CREATE INDEX idx_safety_scores_paused    ON safety_scores (auto_paused) WHERE auto_paused = TRUE;

CREATE TRIGGER trg_safety_scores_updated_at
    BEFORE UPDATE ON safety_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- MODULE R: WEBHOOKS
-- Partners and hosts can subscribe to platform events.
-- ------------------------------------------------------------

CREATE TABLE webhook_subscriptions (
    id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Endpoint to POST to
    url             TEXT                    NOT NULL,
    secret          VARCHAR(64)             NOT NULL,   -- HMAC-SHA256 signing secret

    -- Which events this subscription receives
    events          webhook_event_type[]    NOT NULL,

    -- Status
    is_active       BOOLEAN                 NOT NULL DEFAULT TRUE,
    last_delivery_at TIMESTAMPTZ,
    failure_count   INT                     NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_subs_user    ON webhook_subscriptions (user_id);
CREATE INDEX idx_webhook_subs_events  ON webhook_subscriptions USING GIN (events);
CREATE INDEX idx_webhook_subs_active  ON webhook_subscriptions (is_active) WHERE is_active = TRUE;

CREATE TRIGGER trg_webhook_subs_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE webhook_deliveries (
    id                  BIGSERIAL               PRIMARY KEY,
    subscription_id     UUID                    NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type          webhook_event_type      NOT NULL,
    event_id            VARCHAR(100)            NOT NULL,   -- unique event identifier

    -- Delivery
    status              webhook_delivery_status NOT NULL DEFAULT 'pending',
    attempt_count       SMALLINT                NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,

    -- Request / response
    request_payload     JSONB                   NOT NULL DEFAULT '{}',
    response_status     SMALLINT,
    response_body       TEXT,
    error_message       TEXT,

    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    delivered_at        TIMESTAMPTZ,

    CONSTRAINT uq_webhook_delivery UNIQUE (subscription_id, event_id)
);

CREATE INDEX idx_webhook_deliveries_sub     ON webhook_deliveries (subscription_id);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (next_retry_at)
    WHERE status IN ('pending', 'retrying');
