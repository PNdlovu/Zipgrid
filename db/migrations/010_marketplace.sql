-- ============================================================
-- Migration 010: Marketplace — Products, Installers, Orders
-- ============================================================
-- Covers Module F:
--   F1. Hardware & accessories product listings
--   F2. Installer & technician service profiles and jobs
--
-- Money rule: ALL values stored as pence/cents (INT). Never floats.
-- ============================================================


-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE product_status AS ENUM (
    'draft',
    'active',
    'out_of_stock',
    'discontinued'
);

CREATE TYPE order_status AS ENUM (
    'pending',
    'payment_authorised',
    'confirmed',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
);

CREATE TYPE installer_job_status AS ENUM (
    'pending',          -- awaiting installer confirmation
    'confirmed',        -- installer accepted
    'in_progress',      -- on site
    'completed',        -- work done, escrow release pending
    'disputed',
    'cancelled'
);

CREATE TYPE service_category AS ENUM (
    'new_installation',
    'repair',
    'maintenance',
    'upgrade',
    'survey',
    'ev_ready_survey',
    'other'
);


-- ------------------------------------------------------------
-- PRODUCT CATEGORIES
-- ------------------------------------------------------------

CREATE TABLE product_categories (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(80) NOT NULL UNIQUE,
    slug        VARCHAR(80) NOT NULL UNIQUE,
    description TEXT,
    parent_id   UUID        REFERENCES product_categories(id),
    sort_order  SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO product_categories (name, slug, sort_order) VALUES
    ('EV Chargers',         'ev-chargers',     1),
    ('Charging Cables',     'charging-cables', 2),
    ('Adapters',            'adapters',        3),
    ('Solar & Energy',      'solar-energy',    4),
    ('Smart Plugs',         'smart-plugs',     5),
    ('Accessories',         'accessories',     6);


-- ------------------------------------------------------------
-- VENDOR PROFILES
-- Vendors list hardware products on the marketplace.
-- Separate from host_profiles — a vendor is a business seller.
-- ------------------------------------------------------------

CREATE TABLE vendor_profiles (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    business_name               VARCHAR(200) NOT NULL,
    business_reg_number         VARCHAR(100),
    vat_number                  VARCHAR(50),
    logo_url                    TEXT,
    description                 TEXT,

    -- Stripe Connect for payouts
    stripe_connect_account_id   TEXT,
    stripe_connect_onboarded    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Verification
    is_verified                 BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at                 TIMESTAMPTZ,

    -- Stats (denormalised)
    total_products              INT     NOT NULL DEFAULT 0,
    total_sales_cents           BIGINT  NOT NULL DEFAULT 0,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_vendor_user UNIQUE (user_id)
);

CREATE INDEX idx_vendor_profiles_user ON vendor_profiles (user_id);

CREATE TRIGGER trg_vendor_profiles_updated_at
    BEFORE UPDATE ON vendor_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- PRODUCTS
-- ------------------------------------------------------------

CREATE TABLE products (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_profile_id   UUID            NOT NULL REFERENCES vendor_profiles(id) ON DELETE RESTRICT,
    category_id         UUID            NOT NULL REFERENCES product_categories(id),

    name                VARCHAR(200)    NOT NULL,
    slug                VARCHAR(200)    NOT NULL UNIQUE,
    description         TEXT,
    short_description   VARCHAR(500),
    status              product_status  NOT NULL DEFAULT 'draft',

    -- Pricing (pence)
    price_pence         INT             NOT NULL,
    compare_at_pence    INT,            -- original price for sale display
    vat_inclusive       BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Inventory
    sku                 VARCHAR(100)    UNIQUE,
    stock_qty           INT             NOT NULL DEFAULT 0,
    track_inventory     BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Media
    photo_urls          TEXT[]          NOT NULL DEFAULT '{}',
    thumbnail_url       TEXT,

    -- Specs (flexible JSONB)
    specs               JSONB           NOT NULL DEFAULT '{}',
    -- e.g. { "connector": "Type 2", "max_power_kw": 7.4, "cable_length_m": 5 }

    -- Compatibility filter tags
    compatible_plug_types   TEXT[]      DEFAULT '{}',
    -- e.g. '{Type2, CCS2}'

    -- Platform commission: 7%
    commission_rate_pct NUMERIC(5,2)    NOT NULL DEFAULT 7.00,

    -- SEO
    meta_title          VARCHAR(200),
    meta_description    VARCHAR(500),

    -- Stats
    total_sold          INT             NOT NULL DEFAULT 0,
    average_rating      NUMERIC(3,2),
    review_count        INT             NOT NULL DEFAULT 0,

    featured            BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_vendor       ON products (vendor_profile_id);
CREATE INDEX idx_products_category     ON products (category_id);
CREATE INDEX idx_products_status       ON products (status);
CREATE INDEX idx_products_featured     ON products (featured) WHERE featured = TRUE;
CREATE INDEX idx_products_plug_types   ON products USING GIN (compatible_plug_types);

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- CART ITEMS
-- Server-side cart — one row per (user, product).
-- Cleared on order creation.
-- ------------------------------------------------------------

CREATE TABLE cart_items (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity    INT     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_cart_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX idx_cart_items_user ON cart_items (user_id);


-- ------------------------------------------------------------
-- ORDERS
-- Created when cart is checked out.
-- ------------------------------------------------------------

CREATE TABLE orders (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_user_id           UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    status                  order_status    NOT NULL DEFAULT 'pending',

    -- Stripe
    stripe_payment_intent_id    VARCHAR(100) UNIQUE,
    stripe_charge_id            VARCHAR(100),

    -- Money (pence)
    subtotal_pence          INT             NOT NULL DEFAULT 0,
    shipping_pence          INT             NOT NULL DEFAULT 0,
    vat_pence               INT             NOT NULL DEFAULT 0,
    total_pence             INT             NOT NULL DEFAULT 0,
    platform_fee_pence      INT             NOT NULL DEFAULT 0,

    -- Delivery
    shipping_address        JSONB           NOT NULL DEFAULT '{}',
    shipping_carrier        VARCHAR(80),
    tracking_number         VARCHAR(100),
    shipped_at              TIMESTAMPTZ,
    delivered_at            TIMESTAMPTZ,

    cancelled_at            TIMESTAMPTZ,
    cancellation_reason     TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_buyer  ON orders (buyer_user_id);
CREATE INDEX idx_orders_status ON orders (status);

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- ORDER LINE ITEMS
-- ------------------------------------------------------------

CREATE TABLE order_line_items (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID    NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    vendor_id       UUID    NOT NULL REFERENCES vendor_profiles(id),

    quantity        INT     NOT NULL,
    unit_price_pence    INT NOT NULL,   -- snapshot at order time
    total_price_pence   INT NOT NULL,
    commission_pence    INT NOT NULL DEFAULT 0,
    vendor_net_pence    INT NOT NULL DEFAULT 0,

    CONSTRAINT uq_order_line_item UNIQUE (order_id, product_id)
);

CREATE INDEX idx_order_line_items_order   ON order_line_items (order_id);
CREATE INDEX idx_order_line_items_vendor  ON order_line_items (vendor_id);


-- ------------------------------------------------------------
-- INSTALLER PROFILES
-- OZEV-certified technicians who offer installation services.
-- ------------------------------------------------------------

CREATE TABLE installer_profiles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Business
    business_name       VARCHAR(200),
    bio                 TEXT,
    avatar_url          TEXT,
    portfolio_urls      TEXT[]      DEFAULT '{}',

    -- Certifications
    ozev_certified      BOOLEAN     NOT NULL DEFAULT FALSE,
    ozev_cert_number    VARCHAR(50),
    niceic_registered   BOOLEAN     NOT NULL DEFAULT FALSE,
    napit_registered    BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Coverage
    coverage_postcodes  TEXT[]      NOT NULL DEFAULT '{}',
    -- e.g. '{SW1, SW2, SW9, SE1}'
    coverage_radius_km  INT         NOT NULL DEFAULT 30,
    base_postcode       VARCHAR(10),
    base_latitude       NUMERIC(10,7),
    base_longitude      NUMERIC(10,7),
    base_location       GEOGRAPHY(POINT, 4326),

    -- Services offered
    service_categories  service_category[]  NOT NULL DEFAULT '{}',

    -- Pricing
    hourly_rate_pence   INT,        -- NULL = quote only
    call_out_fee_pence  INT         NOT NULL DEFAULT 0,

    -- Stripe Connect for job payouts
    stripe_connect_account_id   TEXT,
    stripe_connect_onboarded    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Platform badge
    is_verified         BOOLEAN     NOT NULL DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,

    -- Stats
    total_jobs          INT         NOT NULL DEFAULT 0,
    average_rating      NUMERIC(3,2),
    review_count        INT         NOT NULL DEFAULT 0,
    response_rate_pct   NUMERIC(5,2),

    -- Availability
    accepting_work      BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_installer_user UNIQUE (user_id)
);

CREATE INDEX idx_installer_profiles_user     ON installer_profiles (user_id);
CREATE INDEX idx_installer_profiles_location ON installer_profiles USING GIST (base_location)
    WHERE base_location IS NOT NULL;
CREATE INDEX idx_installer_profiles_verified ON installer_profiles (is_verified)
    WHERE is_verified = TRUE AND accepting_work = TRUE;
CREATE INDEX idx_installer_profiles_services ON installer_profiles USING GIN (service_categories);

CREATE TRIGGER trg_installer_profiles_updated_at
    BEFORE UPDATE ON installer_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- INSTALLER JOBS
-- Service bookings between a homeowner/host and an installer.
-- Payment held in escrow (Stripe PaymentIntent manual capture)
-- until job is marked completed.
-- ------------------------------------------------------------

CREATE TABLE installer_jobs (
    id                      UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    installer_profile_id    UUID                    NOT NULL REFERENCES installer_profiles(id) ON DELETE RESTRICT,
    client_user_id          UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- What listing this job is for (optional — may be new install)
    listing_id              UUID                    REFERENCES charger_listings(id),

    -- Job details
    service_category        service_category        NOT NULL,
    title                   VARCHAR(200)            NOT NULL,
    description             TEXT,
    address                 JSONB                   NOT NULL DEFAULT '{}',
    job_location            GEOGRAPHY(POINT, 4326),

    -- Scheduling
    scheduled_date          DATE,
    scheduled_time          TIME,
    estimated_duration_hrs  NUMERIC(4,1),

    -- Status
    status                  installer_job_status    NOT NULL DEFAULT 'pending',

    -- Pricing (agreed at booking time)
    quoted_price_pence      INT,
    final_price_pence       INT,
    commission_rate_pct     NUMERIC(5,2)            NOT NULL DEFAULT 12.00,
    platform_fee_pence      INT,
    installer_net_pence     INT,

    -- Stripe
    stripe_payment_intent_id    VARCHAR(100) UNIQUE,

    -- Completion
    client_signed_off_at    TIMESTAMPTZ,
    installer_completed_at  TIMESTAMPTZ,
    cancellation_reason     TEXT,
    cancelled_at            TIMESTAMPTZ,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_installer_jobs_installer ON installer_jobs (installer_profile_id);
CREATE INDEX idx_installer_jobs_client    ON installer_jobs (client_user_id);
CREATE INDEX idx_installer_jobs_status    ON installer_jobs (status);
CREATE INDEX idx_installer_jobs_location  ON installer_jobs USING GIST (job_location)
    WHERE job_location IS NOT NULL;

CREATE TRIGGER trg_installer_jobs_updated_at
    BEFORE UPDATE ON installer_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- TRIGGER: Update installer stats after job completion
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_installer_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        UPDATE installer_profiles
        SET total_jobs = total_jobs + 1
        WHERE id = NEW.installer_profile_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_installer_stats
    AFTER UPDATE ON installer_jobs
    FOR EACH ROW EXECUTE FUNCTION update_installer_stats();
