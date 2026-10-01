-- ============================================================
-- Migration 013: Fleet Accounts & Members
-- ============================================================
-- Supports corporate fleet accounts where a company can manage
-- multiple EV drivers, set spend policies, and get consolidated
-- monthly invoices.
--
-- A fleet account is linked to an admin user (fleet_admin role).
-- Drivers are invited by email and join with 'driver' role.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE fleet_member_role AS ENUM (
    'fleet_admin',   -- can manage members, policy, view all usage
    'driver'         -- can book chargers, limited to policy
);

CREATE TYPE fleet_member_status AS ENUM (
    'invited',       -- invitation sent, not yet accepted
    'active',        -- can book chargers
    'suspended',     -- admin-suspended, cannot book
    'removed'        -- removed from fleet
);

CREATE TYPE fleet_invoice_status AS ENUM (
    'current',       -- no outstanding invoices
    'pending',       -- invoice generated, awaiting payment
    'overdue'        -- payment past due
);


-- ------------------------------------------------------------
-- FLEET ACCOUNTS
-- One account per company. Holds spend policy and billing info.
-- ------------------------------------------------------------

CREATE TABLE fleet_accounts (
    id                              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name                    VARCHAR(200)            NOT NULL,
    company_registration            VARCHAR(100),           -- UK Companies House registration
    vat_number                      VARCHAR(50),

    -- Spend policy (applied to all drivers)
    max_spend_per_session_pence     INT,                    -- NULL = unlimited
    max_spend_per_month_pence       INT,                    -- NULL = unlimited
    allowed_listing_types           TEXT[]      DEFAULT '{}',
    requires_approval               BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Billing
    invoice_status                  fleet_invoice_status NOT NULL DEFAULT 'current',
    billing_email                   VARCHAR(254),
    stripe_subscription_id          VARCHAR(100),

    -- Contact
    admin_user_id                   UUID        NOT NULL REFERENCES users(id),

    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fleet_accounts_admin ON fleet_accounts (admin_user_id);

CREATE TRIGGER trg_fleet_accounts_updated_at
    BEFORE UPDATE ON fleet_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- FLEET MEMBERS
-- Junction table: user ↔ fleet account with role + status.
-- ------------------------------------------------------------

CREATE TABLE fleet_members (
    id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    fleet_account_id    UUID                    NOT NULL REFERENCES fleet_accounts(id) ON DELETE CASCADE,
    user_id             UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    role                fleet_member_role       NOT NULL DEFAULT 'driver',
    status              fleet_member_status     NOT NULL DEFAULT 'invited',

    -- Invite metadata
    invited_by_user_id  UUID                    REFERENCES users(id),
    invited_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    accepted_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fleet_member UNIQUE (fleet_account_id, user_id)
);

CREATE INDEX idx_fleet_members_account ON fleet_members (fleet_account_id);
CREATE INDEX idx_fleet_members_user    ON fleet_members (user_id);
CREATE INDEX idx_fleet_members_status  ON fleet_members (status);

CREATE TRIGGER trg_fleet_members_updated_at
    BEFORE UPDATE ON fleet_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- FLEET BOOKINGS VIEW
-- Denormalised view used by the invoice generator and analytics.
-- Joins fleet membership to bookings/sessions/transactions.
-- ------------------------------------------------------------

CREATE VIEW fleet_booking_summary AS
SELECT
    fa.id                               AS fleet_account_id,
    fa.company_name,
    fm.user_id,
    u.full_name                         AS driver_name,
    u.email                             AS driver_email,
    b.id                                AS booking_id,
    b.completed_at,
    cl.title                            AS charger_title,
    cl.city,
    cs.started_at,
    cs.ended_at,
    ROUND((cs.energy_consumed_wh / 1000.0)::NUMERIC, 3) AS energy_kwh,
    COALESCE(t.total_charged_cents, 0)  AS total_charged_pence,
    COALESCE(t.tax_cents, 0)            AS vat_pence,
    t.status                            AS transaction_status
FROM fleet_members fm
JOIN fleet_accounts fa ON fa.id = fm.fleet_account_id
JOIN users u ON u.id = fm.user_id
JOIN driver_profiles dp ON dp.user_id = fm.user_id
JOIN bookings b ON b.driver_profile_id = dp.id AND b.status = 'completed'
JOIN charger_listings cl ON cl.id = b.listing_id
JOIN charging_sessions cs ON cs.booking_id = b.id
LEFT JOIN transactions t ON t.booking_id = b.id
WHERE fm.status = 'active';
