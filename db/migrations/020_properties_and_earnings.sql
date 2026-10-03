-- ============================================================
-- Migration 020: Residential properties + earnings allocation ledger
-- ============================================================
-- properties          — a building/site managed by a host (property manager)
-- property_bays       — charger listings that belong to the property; a bay
--                       may be assigned to a resident (who then shares revenue)
-- property_residents  — residents invited to / members of the property
-- earnings_allocations— who earned what from each captured transaction;
--                       payouts are paid from this ledger
-- ============================================================

DO $$ BEGIN
    CREATE TYPE property_revenue_model AS ENUM ('property', 'resident', 'split');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE property_access_mode AS ENUM ('residents_only', 'public', 'residents_priority');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE property_resident_status AS ENUM ('invited', 'active', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE earnings_share AS ENUM ('host', 'property', 'resident');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── properties ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_profile_id          UUID NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
    name                     VARCHAR(150) NOT NULL,
    address_line1            VARCHAR(200) NOT NULL,
    address_line2            VARCHAR(100),
    city                     VARCHAR(100) NOT NULL,
    postcode                 VARCHAR(10)  NOT NULL,
    country_code             CHAR(2)      NOT NULL DEFAULT 'GB',
    latitude                 NUMERIC(10,7),
    longitude                NUMERIC(10,7),
    total_units              INTEGER CHECK (total_units IS NULL OR total_units > 0),
    revenue_model            property_revenue_model NOT NULL DEFAULT 'property',
    -- Percentage of host earnings kept by the property under the 'split' model.
    split_property_pct       SMALLINT NOT NULL DEFAULT 100 CHECK (split_property_pct BETWEEN 0 AND 100),
    access_mode              property_access_mode NOT NULL DEFAULT 'residents_priority',
    resident_discount_pct    SMALLINT NOT NULL DEFAULT 0 CHECK (resident_discount_pct BETWEEN 0 AND 100),
    archived_at              TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_host ON properties (host_profile_id) WHERE archived_at IS NULL;

-- ── property_residents ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_residents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    email               CITEXT NOT NULL,
    unit_number         VARCHAR(30),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    status              property_resident_status NOT NULL DEFAULT 'invited',
    invite_token_hash   CHAR(64),
    invite_expires_at   TIMESTAMPTZ,
    invited_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at         TIMESTAMPTZ,
    removed_at          TIMESTAMPTZ,
    UNIQUE (property_id, email)
);
CREATE INDEX IF NOT EXISTS idx_property_residents_user ON property_residents (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_residents_token ON property_residents (invite_token_hash)
    WHERE invite_token_hash IS NOT NULL;

-- ── property_bays ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_bays (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id            UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    listing_id             UUID NOT NULL UNIQUE REFERENCES charger_listings(id) ON DELETE CASCADE,
    bay_label              VARCHAR(40),
    assigned_resident_id   UUID REFERENCES property_residents(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_bays_property ON property_bays (property_id);

-- ── earnings_allocations ─────────────────────────────────────
-- One row per beneficiary per transaction (negative rows record refunds).
CREATE TABLE IF NOT EXISTS earnings_allocations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id       UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    beneficiary_user_id  UUID NOT NULL REFERENCES users(id),
    share                earnings_share NOT NULL,
    amount_pence         INTEGER NOT NULL,
    reason               VARCHAR(40) NOT NULL DEFAULT 'capture',
    payout_batch_id      UUID REFERENCES payout_batches(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (transaction_id, beneficiary_user_id, share, reason)
);
CREATE INDEX IF NOT EXISTS idx_earnings_unbatched
    ON earnings_allocations (beneficiary_user_id) WHERE payout_batch_id IS NULL;

-- Payout batches can pay any beneficiary (residents need not be hosts).
ALTER TABLE payout_batches ALTER COLUMN host_profile_id DROP NOT NULL;
-- Any user can connect a payout account; set by the Stripe account.updated webhook.
ALTER TABLE users ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users u SET stripe_connect_account_id = hp.stripe_connect_account_id,
                   payouts_enabled = hp.stripe_connect_onboarded
FROM host_profiles hp
WHERE hp.user_id = u.id AND hp.stripe_connect_account_id IS NOT NULL AND u.stripe_connect_account_id IS NULL;

-- Backfill: captured transactions so far belong entirely to the listing's host.
INSERT INTO earnings_allocations (transaction_id, beneficiary_user_id, share, amount_pence, reason, payout_batch_id)
SELECT t.id, hp.user_id, 'host', COALESCE(t.host_earnings_cents, 0), 'capture', t.payout_batch_id
FROM transactions t
JOIN bookings b         ON b.id = t.booking_id
JOIN charger_listings cl ON cl.id = b.listing_id
JOIN host_profiles hp   ON hp.id = cl.host_profile_id
WHERE t.status IN ('captured', 'partially_refunded') AND COALESCE(t.host_earnings_cents, 0) > 0
ON CONFLICT DO NOTHING;

DO $$ BEGIN
    CREATE TRIGGER trg_properties_updated_at
        BEFORE UPDATE ON properties
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
