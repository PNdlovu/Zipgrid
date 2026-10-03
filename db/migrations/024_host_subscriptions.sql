-- 024_host_subscriptions.sql
-- Host plans (Starter / Growth / Pro) backed by Stripe subscriptions.
--
-- host_profiles.platform_tier and commission_rate_pct are written only by
-- HostPlanService from Stripe subscription state; each booking's transaction
-- snapshots commission_rate_pct when payment is secured, and settlement splits
-- revenue at that rate.

-- 'standard' was never a real plan; every host starts on Starter.
UPDATE host_profiles SET platform_tier = 'starter' WHERE platform_tier NOT IN ('starter', 'growth', 'pro');
ALTER TABLE host_profiles ALTER COLUMN platform_tier SET DEFAULT 'starter';
DO $$ BEGIN
    ALTER TABLE host_profiles ADD CONSTRAINT chk_host_profiles_platform_tier
        CHECK (platform_tier IN ('starter', 'growth', 'pro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE host_profiles
    ADD COLUMN IF NOT EXISTS stripe_subscription_id            VARCHAR(100),
    ADD COLUMN IF NOT EXISTS subscription_status                VARCHAR(30),
    ADD COLUMN IF NOT EXISTS subscription_interval              VARCHAR(10),
    ADD COLUMN IF NOT EXISTS subscription_current_period_end    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_host_profiles_subscription
    ON host_profiles (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
