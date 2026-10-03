-- ============================================================
-- Migration 012: Payout Batches, GDPR, Support Chat,
--                Charger Connectors, Consent Records
-- ============================================================
-- Adds tables that domain services reference but had no migration:
--   payout_batches          — weekly host payout scheduling (PayoutService)
--   gdpr_deletion_requests  — Art. 17 right-to-erasure queue (GdprService)
--   consent_records         — Art. 7 consent management (GdprService)
--   support_conversations   — In-app AI support chat threads
--   support_messages        — Individual support chat messages
--   charger_connectors      — Per-connector status from OCPP StatusNotification
-- ============================================================

-- The migration runner wraps each file in its own transaction.

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

-- payout_status already exists (migration 004); batches also need 'completed'.
ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'completed';

CREATE TYPE gdpr_deletion_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'rejected'
);

CREATE TYPE support_conversation_status AS ENUM (
    'open',
    'resolved',
    'escalated'
);

CREATE TYPE support_message_role AS ENUM (
    'user',
    'assistant',
    'system'
);

CREATE TYPE consent_purpose AS ENUM (
    'marketing_email',
    'marketing_sms',
    'analytics',
    'personalisation',
    'third_party_sharing'
);

-- ------------------------------------------------------------
-- PAYOUT BATCHES
-- Weekly earnings batches per host, processed via Stripe Connect.
-- ------------------------------------------------------------

CREATE TABLE payout_batches (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_user_id            UUID NOT NULL REFERENCES users(id),
    host_profile_id         UUID NOT NULL REFERENCES host_profiles(id),

    -- Period covered by this payout
    period_start            TIMESTAMPTZ NOT NULL,
    period_end              TIMESTAMPTZ NOT NULL,

    -- Financials (all pence)
    completed_sessions      INT NOT NULL DEFAULT 0,
    gross_earnings_pence    INT NOT NULL DEFAULT 0,
    platform_fee_pence      INT NOT NULL DEFAULT 0,
    net_earnings_pence      INT NOT NULL DEFAULT 0,

    -- Processing state
    status                  payout_status NOT NULL DEFAULT 'pending',
    stripe_transfer_id      TEXT,           -- tr_xxx returned by Stripe Connect
    failure_reason          TEXT,
    processed_at            TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payout_batches_host_period_unique
        UNIQUE (host_user_id, period_start, period_end)
);

-- Link transactions to their payout batch (NULL = not yet batched)
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS payout_batch_id UUID REFERENCES payout_batches(id);

CREATE INDEX idx_payout_batches_host_user_id  ON payout_batches(host_user_id);
CREATE INDEX idx_payout_batches_status        ON payout_batches(status);
CREATE INDEX idx_payout_batches_period_start  ON payout_batches(period_start);
CREATE INDEX idx_transactions_payout_batch_id ON transactions(payout_batch_id);

-- ------------------------------------------------------------
-- GDPR DELETION REQUESTS (Art. 17)
-- 30-day cooling-off period before PII is anonymised.
-- ------------------------------------------------------------

CREATE TABLE gdpr_deletion_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    reason          TEXT,
    status          gdpr_deletion_status NOT NULL DEFAULT 'pending',
    scheduled_for   TIMESTAMPTZ NOT NULL,   -- NOW() + 30 days
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_deletion_user_id ON gdpr_deletion_requests(user_id);
CREATE INDEX idx_gdpr_deletion_status  ON gdpr_deletion_requests(status);
CREATE INDEX idx_gdpr_deletion_sched   ON gdpr_deletion_requests(scheduled_for)
    WHERE status = 'pending';

-- Soft-delete columns for users — anonymisation targets
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at                 TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS kyc_verification_session_id TEXT,
    ADD COLUMN IF NOT EXISTS kyc_verified_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS kyc_rejection_reason       TEXT;

ALTER TABLE driver_profiles
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE host_profiles
    ADD COLUMN IF NOT EXISTS deleted_at                     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stripe_connect_onboarded       BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------
-- CONSENT RECORDS (Art. 7)
-- One row per user × purpose, upserted on every consent change.
-- ------------------------------------------------------------

CREATE TABLE consent_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    purpose         consent_purpose NOT NULL,
    granted         BOOLEAN NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at    TIMESTAMPTZ,

    CONSTRAINT consent_records_user_purpose_unique
        UNIQUE (user_id, purpose)
);

CREATE INDEX idx_consent_records_user_id ON consent_records(user_id);

-- ------------------------------------------------------------
-- SUPPORT CONVERSATIONS + MESSAGES
-- In-app AI support chat. One conversation per user per 24h period.
-- ------------------------------------------------------------

CREATE TABLE support_conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    status      support_conversation_status NOT NULL DEFAULT 'open',
    -- Escalation (human handoff)
    escalated_to_agent_id UUID REFERENCES users(id),
    escalated_at          TIMESTAMPTZ,
    resolved_at           TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_conv_user_id ON support_conversations(user_id);
CREATE INDEX idx_support_conv_status  ON support_conversations(status);

CREATE TABLE support_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
    role                support_message_role NOT NULL,
    content             TEXT NOT NULL,
    -- Optional metadata (intent, confidence, tool calls)
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_support_messages_conv_id ON support_messages(conversation_id);
CREATE INDEX idx_support_messages_created ON support_messages(created_at DESC);

-- ------------------------------------------------------------
-- CHARGER CONNECTORS
-- Per-connector status as reported by OCPP StatusNotification.
-- Connector 0 = charger-level status (stored on charger_devices).
-- Connector 1+ = individual connectors.
-- ------------------------------------------------------------

CREATE TABLE charger_connectors (
    charge_point_id     TEXT NOT NULL,
    connector_id        INT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'Unknown',
    error_code          TEXT NOT NULL DEFAULT 'NoError',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (charge_point_id, connector_id)
);

CREATE INDEX idx_charger_connectors_cp_id ON charger_connectors(charge_point_id);

-- Add api_key_hash column to charger_devices if not present (replaces plain api_key)
ALTER TABLE charger_devices
    ADD COLUMN IF NOT EXISTS api_key_hash TEXT,
    ADD COLUMN IF NOT EXISTS current_status TEXT NOT NULL DEFAULT 'Unknown',
    ADD COLUMN IF NOT EXISTS error_code     TEXT NOT NULL DEFAULT 'NoError';

-- Notification preferences (referenced by NotificationService)
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id              UUID PRIMARY KEY REFERENCES users(id),
    email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    push_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    categories_disabled  TEXT[] NOT NULL DEFAULT '{}',
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- UPDATED_AT triggers for new tables
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    CREATE TRIGGER trg_payout_batches_updated_at
        BEFORE UPDATE ON payout_batches
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_gdpr_deletion_updated_at
        BEFORE UPDATE ON gdpr_deletion_requests
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_support_conv_updated_at
        BEFORE UPDATE ON support_conversations
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- COMMENTS
-- ------------------------------------------------------------

COMMENT ON TABLE payout_batches           IS 'Weekly host earnings batches transferred via Stripe Connect';
COMMENT ON TABLE gdpr_deletion_requests   IS 'GDPR Art. 17 right-to-erasure queue with 30-day cooling-off';
COMMENT ON TABLE consent_records          IS 'GDPR Art. 7 per-purpose consent log per user';
COMMENT ON TABLE support_conversations    IS 'AI support chat conversation threads';
COMMENT ON TABLE support_messages         IS 'Individual messages within a support conversation';
COMMENT ON TABLE charger_connectors       IS 'Per-connector OCPP status from StatusNotification (connector 1+)';
COMMENT ON TABLE notification_preferences IS 'Per-user notification delivery channel preferences';

