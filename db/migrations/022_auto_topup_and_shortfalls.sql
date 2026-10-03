-- 022_auto_topup_and_shortfalls.sql
-- Auto top-up attempts and recovery of session costs above the payment hold.
--
-- Auto top-up: the driver's default card is charged off-session when the wallet
-- falls below their threshold, or when a wallet booking needs more funds. One
-- attempt may be in flight per user; consecutive failures disable the feature.
--
-- Shortfalls: when a session costs more than was reserved/authorised, the host
-- is still paid for the full session and the difference becomes a
-- payment_shortfalls row, collected from the wallet, then the default card.
-- An open shortfall blocks new bookings until it is collected.

ALTER TYPE wallet_tx_type ADD VALUE IF NOT EXISTS 'shortfall_payment';

ALTER TABLE wallet_balances ADD COLUMN IF NOT EXISTS auto_topup_failures INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wallet_auto_topups (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger          VARCHAR(20) NOT NULL CHECK (trigger IN ('low_balance', 'booking')),
    amount_pence     INT NOT NULL CHECK (amount_pence > 0),
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'succeeded', 'failed')),
    stripe_pi_id     VARCHAR(100),
    failure_message  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);
-- At most one attempt in flight per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_auto_topups_pending
    ON wallet_auto_topups (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wallet_auto_topups_user_created
    ON wallet_auto_topups (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_shortfalls (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id     UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id),
    amount_pence       INT NOT NULL CHECK (amount_pence > 0),
    collected_pence    INT NOT NULL DEFAULT 0,
    status             VARCHAR(20) NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'collected', 'written_off')),
    stripe_pi_id       VARCHAR(100),
    attempts           INT NOT NULL DEFAULT 0,
    last_error         TEXT,
    last_attempt_at    TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at        TIMESTAMPTZ,
    CHECK (collected_pence >= 0 AND collected_pence <= amount_pence)
);
CREATE INDEX IF NOT EXISTS idx_payment_shortfalls_open
    ON payment_shortfalls (user_id) WHERE status = 'open';
