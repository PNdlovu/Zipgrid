-- 025_concierge.sql
-- AI charging concierge (ConciergeService, Claude).
--
-- concierge_conversations keeps the full Claude message history server-side
-- (thinking blocks and tool results included) so clients can never forge a
-- tool result. `turn` counts the user's messages.
--
-- concierge_actions are side effects the agent has proposed (book, cancel,
-- stop charging). An action can only be executed in a later turn than the one
-- that proposed it, i.e. after the user has replied, and within 15 minutes.

CREATE TABLE IF NOT EXISTS concierge_conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
    turn        INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_concierge_conversations_user ON concierge_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS concierge_actions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES concierge_conversations(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind             VARCHAR(30) NOT NULL CHECK (kind IN ('book', 'cancel_booking', 'stop_session')),
    payload          JSONB NOT NULL,
    summary          TEXT NOT NULL,
    proposed_turn    INT NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed')),
    result           JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
    executed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_concierge_actions_conversation ON concierge_actions (conversation_id, created_at DESC);
