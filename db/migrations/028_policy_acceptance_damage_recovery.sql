-- 028_policy_acceptance_damage_recovery.sql
-- Host and driver protection:
--   policy_acceptances  — which version of each legal policy a user accepted,
--                         when and from where (evidence for disputes and claims)
--   disputes            — a 24-hour acknowledgement deadline, the booking/session
--                         record captured when the case is opened, and the
--                         damage amount recovered from the driver
--   payment_shortfalls  — also carries damage charges ('damage' kind), so a
--                         driver found responsible for damage pays through the
--                         same wallet → card collection as a session shortfall

-- ── policy_acceptances ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_acceptances (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id),
    policy       VARCHAR(40) NOT NULL
                 CHECK (policy IN ('terms', 'privacy', 'host_terms', 'driver_terms')),
    version      VARCHAR(20) NOT NULL,
    ip_address   INET,
    user_agent   TEXT,
    accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, policy, version)
);
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_user ON policy_acceptances (user_id);

-- ── disputes: acknowledgement deadline + evidence snapshot ───
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS acknowledge_by        TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS acknowledged_at       TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS session_snapshot      JSONB;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS damage_charge_pence   INT NOT NULL DEFAULT 0
    CHECK (damage_charge_pence >= 0);

UPDATE disputes SET acknowledge_by = created_at + INTERVAL '24 hours' WHERE acknowledge_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_unacknowledged
    ON disputes (acknowledge_by) WHERE acknowledged_at IS NULL;

-- ── payment_shortfalls: damage charges ───────────────────────
ALTER TABLE payment_shortfalls ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'session';
ALTER TABLE payment_shortfalls ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id);

DO $$ BEGIN
    ALTER TABLE payment_shortfalls ADD CONSTRAINT payment_shortfalls_kind_check
        CHECK (kind IN ('session', 'damage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One session shortfall per transaction; damage charges are one per dispute.
ALTER TABLE payment_shortfalls DROP CONSTRAINT IF EXISTS payment_shortfalls_transaction_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_shortfalls_session
    ON payment_shortfalls (transaction_id) WHERE kind = 'session';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_shortfalls_dispute
    ON payment_shortfalls (dispute_id) WHERE dispute_id IS NOT NULL;
