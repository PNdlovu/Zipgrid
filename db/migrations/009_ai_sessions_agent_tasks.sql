-- ============================================================
-- Migration 009: AI Sessions & Agent Tasks
-- ============================================================
-- Supports Module D (Voice) and Module E (Agentic AI Layer).
--
-- ai_sessions    — per-user conversation memory (Redis is the
--                  hot store; this table is the durable audit
--                  trail and long-term preference store).
--
-- agent_tasks    — tracks every agentic workflow execution:
--                  fault diagnosis, tariff scheduling,
--                  installer booking suggestions, etc.
--                  Provides idempotency (prevents duplicate
--                  processing of the same OCPP event).
--
-- voice_commands — append-only log of every voice utterance
--                  and the parsed intent. Powers analytics
--                  and intent accuracy monitoring.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE agent_task_status AS ENUM (
    'pending',      -- queued, not yet started
    'running',      -- in progress
    'completed',    -- finished successfully
    'failed',       -- error during execution
    'skipped'       -- duplicate / already handled
);

CREATE TYPE agent_task_type AS ENUM (
    'fault_diagnosis',          -- OCPP fault → GPT-4o diagnosis → host notification
    'tariff_scheduling',        -- auto-schedule charge at cheapest Octopus window
    'installer_suggestion',     -- suggest nearest OZEV installer after hardware fault
    'pricing_suggestion',       -- suggest rate change based on utilisation
    'idle_fee_alert',           -- driver EV done charging, alert before idle fee kicks in
    'recurring_booking',        -- suggest recurring booking for commuter pattern
    'review_response_draft',    -- draft host response to a negative review
    'demand_spike_alert',       -- dynamic pricing suggestion during demand spike
    'general'                   -- catch-all for ad-hoc agentic tasks
);

CREATE TYPE voice_intent AS ENUM (
    'find_charger',
    'book_charger',
    'session_status',
    'stop_session',
    'spend_query',
    'navigate_booking',
    'schedule_charging',
    'block_date',
    'fault_report',
    'unknown'
);


-- ------------------------------------------------------------
-- AI SESSIONS
-- Durable per-user conversation state.
-- Hot path uses Redis (TTL 1h). This table is the cold store:
--   - persisted at session end or on explicit save
--   - used for long-term user preference learning
--   - allows support staff to review conversation history
-- ------------------------------------------------------------

CREATE TABLE ai_sessions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Conversation
    messages        JSONB           NOT NULL DEFAULT '[]',
    -- Array of { role: 'human'|'ai', content: string, ts: ISO8601 }

    -- Mode at the time of conversation
    ai_mode         VARCHAR(20)     NOT NULL DEFAULT 'hybrid',
    -- 'standard' | 'hybrid' | 'agentic'

    -- Turn counts (for analytics)
    turn_count      INT             NOT NULL DEFAULT 0,
    tool_call_count INT             NOT NULL DEFAULT 0,

    -- Session lifecycle
    started_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,

    -- Long-term preference extraction (populated by periodic agent run)
    extracted_prefs JSONB           DEFAULT '{}',
    -- e.g. { preferred_plug: 'CCS2', preferred_location: 'SW9', charge_target_pct: 80 }

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_sessions_user      ON ai_sessions (user_id, last_active_at DESC);
CREATE INDEX idx_ai_sessions_active    ON ai_sessions (last_active_at DESC)
    WHERE ended_at IS NULL;

CREATE TRIGGER trg_ai_sessions_updated_at
    BEFORE UPDATE ON ai_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- AGENT TASKS
-- Tracks every agentic workflow execution end-to-end.
-- Critical for:
--   - Idempotency: fault_diagnosis checks this before re-running
--   - Audit trail: what did the AI decide to do and when
--   - Debugging: what was the agent's input/output
--   - Host transparency: visible in host dashboard
-- ------------------------------------------------------------

CREATE TABLE agent_tasks (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Task metadata
    task_type       agent_task_type     NOT NULL,
    status          agent_task_status   NOT NULL DEFAULT 'pending',

    -- Ownership
    user_id         UUID                REFERENCES users(id) ON DELETE SET NULL,

    -- Source event that triggered this task
    -- For fault_diagnosis: ocpp_event_log.id
    -- For tariff_scheduling: NULL (timer-triggered)
    source_event_id TEXT,

    -- Inputs captured at task creation (for replay/debugging)
    input_payload   JSONB               DEFAULT '{}',

    -- Result from the agent
    result_summary  TEXT,               -- human-readable outcome (≤ 500 chars)
    result_payload  JSONB               DEFAULT '{}',
    -- Full structured output (e.g. diagnosis JSON, suggested price, installer options)

    -- Confirmation tracking (Hybrid/Agentic modes)
    requires_confirmation   BOOLEAN     NOT NULL DEFAULT FALSE,
    confirmed_at            TIMESTAMPTZ,
    confirmed_by            UUID        REFERENCES users(id),

    -- Error tracking
    error_message   TEXT,
    retry_count     SMALLINT            NOT NULL DEFAULT 0,

    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    -- Prevent duplicate processing of the same source event
    CONSTRAINT uq_agent_task_source_type UNIQUE (source_event_id, task_type)
);

CREATE INDEX idx_agent_tasks_user          ON agent_tasks (user_id, created_at DESC);
CREATE INDEX idx_agent_tasks_status        ON agent_tasks (status)
    WHERE status IN ('pending', 'running');
CREATE INDEX idx_agent_tasks_type_status   ON agent_tasks (task_type, status);
CREATE INDEX idx_agent_tasks_source        ON agent_tasks (source_event_id)
    WHERE source_event_id IS NOT NULL;

CREATE TRIGGER trg_agent_tasks_updated_at
    BEFORE UPDATE ON agent_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- VOICE COMMANDS
-- Append-only log of every voice utterance and parsed intent.
-- Used for:
--   - Intent accuracy monitoring (confidence distribution)
--   - Voice adoption KPI (% users using voice weekly)
--   - Training data for future fine-tuning
--   - Debugging mis-parses
-- ------------------------------------------------------------

CREATE TABLE voice_commands (
    id              BIGSERIAL           PRIMARY KEY,
    user_id         UUID                REFERENCES users(id) ON DELETE SET NULL,

    -- Raw input
    transcript      TEXT                NOT NULL,
    language        VARCHAR(10)         NOT NULL DEFAULT 'en-GB',

    -- Parsed intent
    intent          voice_intent        NOT NULL DEFAULT 'unknown',
    confidence      NUMERIC(4, 3)       NOT NULL DEFAULT 0,   -- 0.000–1.000
    params_json     JSONB               DEFAULT '{}',

    -- Page context at time of command
    page_context    VARCHAR(200),

    -- Response
    speech_response TEXT,
    action_type     VARCHAR(50),

    -- Did user confirm or reject a confirmation-required action?
    -- NULL = no confirmation required; true = confirmed; false = cancelled
    user_confirmed  BOOLEAN,

    -- STT method used
    stt_method      VARCHAR(20)         NOT NULL DEFAULT 'web_speech',
    -- 'web_speech' | 'whisper'

    -- Processing time
    latency_ms      INT,

    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Time-series index for analytics queries
CREATE INDEX idx_voice_commands_user_ts    ON voice_commands (user_id, created_at DESC);
CREATE INDEX idx_voice_commands_intent     ON voice_commands (intent, created_at DESC);

-- Partial index for monitoring unknown/low-confidence intents
CREATE INDEX idx_voice_commands_low_conf   ON voice_commands (created_at DESC)
    WHERE intent = 'unknown' OR confidence < 0.5;
