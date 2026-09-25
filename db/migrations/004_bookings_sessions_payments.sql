-- ============================================================
-- Migration 004: Bookings, Charging Sessions & Payments
-- ============================================================
-- Flow:
--   BOOKING (reservation / escrow hold)
--     └──> CHARGING SESSION (live OCPP telemetry)
--           └──> TRANSACTION (final settled charge)
--                 └──> PAYOUT (host disbursement via Stripe)
--
-- Money rule: ALL monetary values stored in cents (INTEGER).
-- Never store floats for currency — avoids rounding drift.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE booking_status AS ENUM (
    'pending',              -- awaiting confirmation (manual-approve listings)
    'confirmed',            -- accepted; payment hold placed on driver card
    'cancelled_by_driver',
    'cancelled_by_host',
    'cancelled_by_platform',
    'completed',            -- session finished, funds settled
    'no_show'               -- driver never arrived; hold released after window
);

CREATE TYPE session_status AS ENUM (
    'initializing',         -- OCPP BootNotification received
    'authorized',           -- OCPP StartTransaction authorized
    'charging',             -- energy actively flowing
    'suspended_ev',         -- EV paused charging (battery management)
    'suspended_evse',       -- Charger paused (e.g. load balancing)
    'finishing',            -- OCPP StopTransaction in progress
    'completed',            -- final meter values received & recorded
    'faulted',              -- OCPP error state
    'timed_out'             -- no OCPP response within expected window
);

CREATE TYPE transaction_status AS ENUM (
    'hold_placed',          -- Stripe PaymentIntent authorized (not captured)
    'captured',             -- funds captured after session completes
    'partially_refunded',
    'fully_refunded',
    'disputed',             -- chargeback initiated
    'failed'
);

CREATE TYPE cancellation_reason AS ENUM (
    'driver_changed_mind',
    'driver_no_show',
    'host_unavailable',
    'charger_hardware_fault',
    'platform_policy_violation',
    'duplicate_booking',
    'weather_emergency',
    'other'
);

CREATE TYPE payout_status AS ENUM (
    'pending',              -- transaction settled; awaiting payout window
    'processing',           -- Stripe transfer initiated
    'paid',                 -- funds arrived in host bank account
    'failed',               -- Stripe transfer failed
    'on_hold'               -- platform hold (dispute investigation)
);


-- ------------------------------------------------------------
-- BOOKINGS
-- A booking is the reservation contract between driver & host.
-- Created when driver reserves a slot; payment hold placed
-- on driver's card immediately via Stripe PaymentIntent.
-- ------------------------------------------------------------

CREATE TABLE bookings (
    id                      UUID                PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parties
    listing_id              UUID                NOT NULL REFERENCES charger_listings(id) ON DELETE RESTRICT,
    driver_profile_id       UUID                NOT NULL REFERENCES driver_profiles(id) ON DELETE RESTRICT,
    vehicle_id              UUID                NOT NULL REFERENCES driver_vehicles(id) ON DELETE RESTRICT,

    -- Schedule
    scheduled_start         TIMESTAMPTZ         NOT NULL,
    scheduled_end           TIMESTAMPTZ         NOT NULL,
    duration_minutes        INT                 NOT NULL
        GENERATED ALWAYS AS (
            EXTRACT(EPOCH FROM (scheduled_end - scheduled_start)) / 60
        ) STORED,

    -- Status
    status                  booking_status      NOT NULL DEFAULT 'pending',
    cancellation_reason     cancellation_reason,
    cancellation_note       TEXT,               -- free-text detail
    cancelled_at            TIMESTAMPTZ,
    cancelled_by_user_id    UUID                REFERENCES users(id),

    -- Pricing snapshot (locked at booking time — host may change rates later)
    pricing_model           pricing_model       NOT NULL,
    quoted_price_per_kwh_cents  INT,
    quoted_price_per_hour_cents INT,
    quoted_price_per_session_cents INT,
    quoted_idle_fee_per_min_cents INT           NOT NULL DEFAULT 10,
    peak_surcharge_pct      NUMERIC(5,2)        NOT NULL DEFAULT 0.00,

    -- Estimated cost shown to driver at booking (before actual kWh known)
    estimated_cost_cents    INT                 NOT NULL DEFAULT 0,

    -- Access info (copied from listing at booking time in case listing changes)
    access_type             access_type         NOT NULL,
    access_instructions     TEXT,               -- encrypted

    -- Instant vs manual approval
    instant_book            BOOLEAN             NOT NULL DEFAULT TRUE,
    host_approved_at        TIMESTAMPTZ,

    -- Confirmation codes
    driver_arrival_code     VARCHAR(8),         -- QR/PIN for check-in
    session_pin             VARCHAR(6),         -- short PIN for manual unlock

    -- Timestamps
    confirmed_at            TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_booking_window CHECK (scheduled_end > scheduled_start),
    CONSTRAINT chk_booking_duration CHECK (duration_minutes >= 30)
);

-- Indexes
CREATE INDEX idx_bookings_listing         ON bookings (listing_id);
CREATE INDEX idx_bookings_driver          ON bookings (driver_profile_id);
CREATE INDEX idx_bookings_status          ON bookings (status);
CREATE INDEX idx_bookings_scheduled_start ON bookings (scheduled_start);

-- Prevent double-booking: no two confirmed/pending bookings
-- on the same listing overlap in time.
CREATE UNIQUE INDEX idx_bookings_no_overlap
    ON bookings (listing_id, scheduled_start, scheduled_end)
    WHERE status IN ('pending', 'confirmed');

CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- CHARGING SESSIONS
-- Represents the live OCPP session tied to a booking.
-- One booking → one session (1:1 after driver plugs in).
-- Populated in real-time by the OCPP WebSocket service.
-- ------------------------------------------------------------

CREATE TABLE charging_sessions (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id              UUID            NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,

    -- OCPP identifiers
    ocpp_transaction_id     INT,            -- OCPP transactionId from StartTransaction.conf
    ocpp_charge_point_id    VARCHAR(100)    NOT NULL,   -- mirrors listing's OCPP ID
    ocpp_connector_id       SMALLINT        NOT NULL DEFAULT 1,

    -- Session lifecycle
    status                  session_status  NOT NULL DEFAULT 'initializing',

    -- Timestamps (recorded from OCPP message timestamps)
    authorized_at           TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,    -- first energy flow
    ended_at                TIMESTAMPTZ,

    -- Meter readings (in Wh — Watt-hours, standard OCPP unit)
    meter_start_wh          BIGINT,         -- from StartTransaction
    meter_stop_wh           BIGINT,         -- from StopTransaction
    energy_consumed_wh      BIGINT          -- computed: stop - start
        GENERATED ALWAYS AS (
            CASE WHEN meter_stop_wh IS NOT NULL AND meter_start_wh IS NOT NULL
                 THEN meter_stop_wh - meter_start_wh
                 ELSE NULL
            END
        ) STORED,

    -- Derived convenience column in kWh (for display)
    -- Note: cast in app layer; Wh is canonical
    peak_power_kw           NUMERIC(8,2),   -- highest instantaneous power reading

    -- Stop reason (OCPP StopTransaction reason field)
    stop_reason             VARCHAR(50),    -- 'EVDisconnected','Local','Remote','EmergencyStop'

    -- Fault info
    fault_code              VARCHAR(50),
    fault_info              TEXT,

    -- OCPP raw event log (append-only JSONB array for debugging)
    -- Stores last N OCPP StatusNotification / MeterValues events
    ocpp_event_log          JSONB           DEFAULT '[]',

    -- Session computed cost (calculated at session end)
    energy_cost_cents       INT,
    idle_fee_cents          INT             NOT NULL DEFAULT 0,
    peak_surcharge_cents    INT             NOT NULL DEFAULT 0,
    total_session_cost_cents INT,

    -- Idle tracking
    idle_started_at         TIMESTAMPTZ,    -- when car stopped charging but stayed plugged
    idle_minutes            INT             NOT NULL DEFAULT 0,

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_session_per_booking UNIQUE (booking_id)
);

CREATE INDEX idx_sessions_booking       ON charging_sessions (booking_id);
CREATE INDEX idx_sessions_status        ON charging_sessions (status);
CREATE INDEX idx_sessions_ocpp_cp_id    ON charging_sessions (ocpp_charge_point_id);
CREATE INDEX idx_sessions_ocpp_txn_id   ON charging_sessions (ocpp_transaction_id)
    WHERE ocpp_transaction_id IS NOT NULL;

CREATE TRIGGER trg_charging_sessions_updated_at
    BEFORE UPDATE ON charging_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- SESSION METER VALUES (time-series telemetry)
-- Every MeterValues OCPP message inserts a row here.
-- Typically sent every 60–300 seconds during active charging.
-- Used for real-time kWh chart in driver app.
-- ------------------------------------------------------------

CREATE TABLE session_meter_values (
    id                  BIGSERIAL       PRIMARY KEY,    -- BIGINT for high-volume inserts
    session_id          UUID            NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,

    recorded_at         TIMESTAMPTZ     NOT NULL,       -- timestamp from OCPP message
    energy_wh           BIGINT          NOT NULL,       -- cumulative Wh at this reading
    power_kw            NUMERIC(8,2),                   -- instantaneous power
    current_a           NUMERIC(6,2),                   -- amperage
    voltage_v           NUMERIC(6,2),                   -- voltage
    soc_pct             SMALLINT,                       -- state of charge % (if EV reports it)
    temperature_c       NUMERIC(5,2)                    -- charger temperature (thermal safety)
);

-- Time-series index: session + time for fast range reads
CREATE INDEX idx_meter_values_session_time
    ON session_meter_values (session_id, recorded_at DESC);


-- ------------------------------------------------------------
-- TRANSACTIONS
-- The financial record for each completed booking.
-- Created when session ends; updated as Stripe webhooks fire.
-- Stripe PaymentIntent is held during session → captured at end.
-- ------------------------------------------------------------

CREATE TABLE transactions (
    id                          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id                  UUID                NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    session_id                  UUID                REFERENCES charging_sessions(id),

    -- Stripe references
    stripe_payment_intent_id    VARCHAR(100)        UNIQUE NOT NULL,
    stripe_charge_id            VARCHAR(100),       -- populated after capture
    stripe_transfer_id          VARCHAR(100),       -- host payout transfer ID

    -- Status
    status                      transaction_status  NOT NULL DEFAULT 'hold_placed',

    -- Money breakdown (all in cents)
    energy_cost_cents           INT                 NOT NULL DEFAULT 0,
    idle_fee_cents              INT                 NOT NULL DEFAULT 0,
    peak_surcharge_cents        INT                 NOT NULL DEFAULT 0,
    subtotal_cents              INT                 NOT NULL DEFAULT 0,
    platform_fee_cents          INT                 NOT NULL DEFAULT 0,  -- Zipgrid commission
    tax_cents                   INT                 NOT NULL DEFAULT 0,
    total_charged_cents         INT                 NOT NULL DEFAULT 0,

    -- Host net earnings
    host_earnings_cents         INT                 NOT NULL DEFAULT 0,

    -- Refund tracking
    refunded_cents              INT                 NOT NULL DEFAULT 0,
    refund_reason               TEXT,

    -- Currency
    currency                    CHAR(3)             NOT NULL DEFAULT 'USD',  -- ISO 4217

    -- Commission snapshot (locked at time of transaction)
    commission_rate_pct         NUMERIC(5,2)        NOT NULL DEFAULT 15.00,

    -- kWh delivered (from session; duplicated here for financial audit trail)
    energy_kwh_delivered        NUMERIC(10,3),

    -- Timestamps
    hold_placed_at              TIMESTAMPTZ,
    captured_at                 TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ,
    disputed_at                 TIMESTAMPTZ,

    created_at                  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_txn_total_positive   CHECK (total_charged_cents >= 0),
    CONSTRAINT chk_txn_refund_lte_total CHECK (refunded_cents <= total_charged_cents)
);

CREATE INDEX idx_transactions_booking       ON transactions (booking_id);
CREATE INDEX idx_transactions_status        ON transactions (status);
CREATE INDEX idx_transactions_stripe_pi     ON transactions (stripe_payment_intent_id);
CREATE INDEX idx_transactions_created_at    ON transactions (created_at DESC);

CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- PAYOUTS
-- Records each Stripe Connect transfer to a host's bank account.
-- A single payout can bundle multiple transactions (weekly batch).
-- ------------------------------------------------------------

CREATE TABLE payouts (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    host_profile_id             UUID            NOT NULL REFERENCES host_profiles(id) ON DELETE RESTRICT,

    -- Stripe
    stripe_payout_id            VARCHAR(100)    UNIQUE,     -- Stripe payout object ID
    stripe_connect_account_id   VARCHAR(100)    NOT NULL,   -- host's Stripe Connect account

    -- Status
    status                      payout_status   NOT NULL DEFAULT 'pending',

    -- Money
    gross_amount_cents          INT             NOT NULL DEFAULT 0,
    platform_fee_cents          INT             NOT NULL DEFAULT 0,
    net_amount_cents            INT             NOT NULL DEFAULT 0,
    currency                    CHAR(3)         NOT NULL DEFAULT 'USD',

    -- Period covered by this payout
    period_start                DATE            NOT NULL,
    period_end                  DATE            NOT NULL,
    transaction_count           INT             NOT NULL DEFAULT 0,

    -- Failure info
    failure_code                VARCHAR(50),
    failure_message             TEXT,

    -- Timestamps
    initiated_at                TIMESTAMPTZ,
    paid_at                     TIMESTAMPTZ,

    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_host       ON payouts (host_profile_id);
CREATE INDEX idx_payouts_status     ON payouts (status);
CREATE INDEX idx_payouts_period     ON payouts (period_start, period_end);

CREATE TRIGGER trg_payouts_updated_at
    BEFORE UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- PAYOUT LINE ITEMS
-- Junction table linking individual transactions to a payout batch.
-- ------------------------------------------------------------

CREATE TABLE payout_line_items (
    id              BIGSERIAL   PRIMARY KEY,
    payout_id       UUID        NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
    transaction_id  UUID        NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    amount_cents    INT         NOT NULL,

    CONSTRAINT uq_payout_line_item UNIQUE (payout_id, transaction_id)
);

CREATE INDEX idx_payout_line_items_payout      ON payout_line_items (payout_id);
CREATE INDEX idx_payout_line_items_transaction ON payout_line_items (transaction_id);


-- ------------------------------------------------------------
-- TRIGGER: Auto-update listing stats after session completes
-- Fires after a charging_session row is updated to 'completed'.
-- Keeps denormalized counters on charger_listings current.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_listing_stats_on_session_complete()
RETURNS TRIGGER AS $$
BEGIN
    -- Only fire when status transitions TO 'completed'
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        UPDATE charger_listings cl
        SET
            total_bookings      = total_bookings + 1,
            total_kwh_delivered = total_kwh_delivered +
                COALESCE(NEW.energy_consumed_wh::NUMERIC / 1000, 0),
            total_revenue_cents = total_revenue_cents +
                COALESCE(NEW.total_session_cost_cents, 0)
        FROM bookings b
        WHERE b.id = NEW.booking_id
          AND cl.id = b.listing_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_listing_stats
    AFTER UPDATE ON charging_sessions
    FOR EACH ROW EXECUTE FUNCTION update_listing_stats_on_session_complete();


-- ------------------------------------------------------------
-- TRIGGER: Auto-update host earnings after payout is paid
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_host_earnings_on_payout()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
        UPDATE host_profiles
        SET total_earnings_cents = total_earnings_cents + NEW.net_amount_cents
        WHERE id = NEW.host_profile_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_host_earnings
    AFTER UPDATE ON payouts
    FOR EACH ROW EXECUTE FUNCTION update_host_earnings_on_payout();
