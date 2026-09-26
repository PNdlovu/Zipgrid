-- Migration 007: Charger devices registry and OCPP event log
-- Supports: OCPP device pairing, charger health tracking, fault logging
-- @since 2026-09-25

-- ── Charger devices ───────────────────────────────────────────
-- One row per physical charger unit paired by a host.
-- Distinct from charger_listings — a device can have multiple listings,
-- or a listing can exist without a paired smart device (manual mode).
CREATE TABLE IF NOT EXISTS charger_devices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id       UUID NOT NULL REFERENCES host_profiles(id) ON DELETE RESTRICT,

  charge_point_id       VARCHAR(100) NOT NULL UNIQUE, -- OCPP CP ID
  brand                 VARCHAR(80) NOT NULL,
  model                 VARCHAR(80) NOT NULL,

  -- Auth (API key used in WSS connection URL)
  api_key               TEXT NOT NULL,               -- store hashed in production

  -- OCPP metadata
  ocpp_url              TEXT NOT NULL,               -- wss://ocpp.zipgrid.co.uk/1.6/{cpId}
  firmware_version      VARCHAR(100),
  vendor_error_code     VARCHAR(100),

  -- Status
  status                VARCHAR(40) NOT NULL DEFAULT 'pending',
  -- pending | online | offline | faulted | unavailable | deactivated

  -- Real-time state (updated by OCPP service)
  last_heartbeat_at     TIMESTAMPTZ,
  last_seen_at          TIMESTAMPTZ,
  active_sessions_count INT NOT NULL DEFAULT 0,

  -- Health
  health_score          SMALLINT DEFAULT 85 CHECK (health_score BETWEEN 0 AND 100),

  -- Config applied at pairing
  meter_value_interval  SMALLINT NOT NULL DEFAULT 60,  -- seconds
  heartbeat_interval    SMALLINT NOT NULL DEFAULT 300, -- seconds

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charger_devices_host ON charger_devices (host_profile_id);
CREATE INDEX IF NOT EXISTS idx_charger_devices_status ON charger_devices (status);

-- Auto-update updated_at
CREATE TRIGGER trg_charger_devices_updated_at
  BEFORE UPDATE ON charger_devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── OCPP event log ────────────────────────────────────────────
-- Append-only log of all OCPP messages/events per charge point.
-- Used for debugging, fault history, and safety score calculation.
CREATE TABLE IF NOT EXISTS ocpp_event_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id   VARCHAR(100) NOT NULL,  -- FK-less for write performance
  event_type        VARCHAR(60) NOT NULL,
  -- BootNotification | Heartbeat | StatusNotification | Authorize |
  -- StartTransaction | StopTransaction | MeterValues | Faulted |
  -- RemoteStart | RemoteStop | ChangeAvailability | ChangeConfiguration

  payload           JSONB,                  -- raw OCPP message payload
  error_code        VARCHAR(80),            -- for StatusNotification Faulted events
  transaction_id    INT,                    -- OCPP transactionId when applicable
  connector_id      SMALLINT,

  -- Fault tracking
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),

  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by charge point + recent events
CREATE INDEX IF NOT EXISTS idx_ocpp_event_log_cpid_ts
  ON ocpp_event_log (charge_point_id, timestamp DESC);

-- Fault-only partial index for health score computation
CREATE INDEX IF NOT EXISTS idx_ocpp_event_log_faults
  ON ocpp_event_log (charge_point_id)
  WHERE event_type = 'Faulted' AND resolved = false;

-- ── charging_sessions additions ───────────────────────────────
-- Columns referenced in session API routes
ALTER TABLE IF EXISTS charging_sessions
  ADD COLUMN IF NOT EXISTS charge_point_id     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS connector_id        SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ocpp_id_tag         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS power_w             INT,          -- latest MeterValues power (Watts)
  ADD COLUMN IF NOT EXISTS soc_percent         SMALLINT,     -- State of Charge 0-100
  ADD COLUMN IF NOT EXISTS price_per_kwh_cents INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_charging_sessions_charge_point
  ON charging_sessions (charge_point_id)
  WHERE charge_point_id IS NOT NULL;

-- ── host_profiles Stripe Connect fields ───────────────────────
ALTER TABLE IF EXISTS host_profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id  TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS superhost                  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_earnings_pence       BIGINT NOT NULL DEFAULT 0;

-- pg_cron cleanup job — remove old OCPP heartbeat events after 7 days
-- SELECT cron.schedule('cleanup-ocpp-heartbeats', '0 4 * * *',
--   $$DELETE FROM ocpp_event_log
--     WHERE event_type = 'Heartbeat' AND timestamp < NOW() - INTERVAL '7 days'$$);
