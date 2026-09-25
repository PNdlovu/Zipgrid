-- Migration 006: OTP codes and auth sessions
-- Supports: email/phone verification OTPs, refresh token session tracking
-- @since 2026-09-25

-- ── OTP codes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('email', 'phone')),
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_type ON otp_codes (user_id, type);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes (expires_at);

-- ── Auth sessions (refresh token tracking) ────────────────────
CREATE TABLE IF NOT EXISTS auth_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL UNIQUE,  -- matches sub-claim of refresh JWT
  ip_address    INET,
  user_agent    TEXT,
  remember_me   BOOLEAN NOT NULL DEFAULT false,
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_session_id ON auth_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);

-- ── email_verified column on users (if not already present) ───
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_mode          VARCHAR(20) NOT NULL DEFAULT 'hybrid';

-- ── Cleanup job — remove expired OTPs daily ───────────────────
-- (pg_cron scheduled in Railway — see 3.6-infrastructure-devops.md)
-- SELECT cron.schedule('cleanup-otp', '0 3 * * *',
--   $$DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '1 hour'$$);
