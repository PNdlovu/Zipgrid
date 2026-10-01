-- ============================================================
-- Zipgrid Demo Seed 002 — Extended Investor Demo Dataset
-- ============================================================
-- Depends on: 001_seed.sql (users, listings, base booking)
--
-- Adds:
--   - 2 additional users (SMB host + installer)
--   - 10 additional UK charger listings (diverse locations + types)
--   - Wallet top-up and spend history
--   - Rewards earn + redeem transaction
--   - Emergency session (accepted flow)
--   - Installer job booking
--   - Marketplace product samples
--   - A dispute (open) for admin demo
--   - Safety score rows
--   - Webhook subscription (for demo outbound webhooks)
--
-- All UUIDs are fixed. Run after 001_seed.sql.
-- ============================================================

BEGIN;

-- ============================================================
-- ADDITIONAL USERS
-- ============================================================

INSERT INTO users (
    id, email, full_name, display_name, phone,
    roles, account_status, kyc_status, kyc_verified_at,
    email_verified_at, stripe_customer_id, stripe_connect_account_id,
    ai_mode
) VALUES
-- SMB host — manages 3+ commercial listings
(
    '00000000-0000-0000-0000-000000000004',
    'andy.park@greencharge.co.uk',
    'Andy Park',
    'Andy P.',
    '+447911123004',
    '{host}',
    'active', 'verified', NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '61 days',
    'cus_test_andy001', 'acct_test_andy001',
    'hybrid'
),
-- OZEV-certified installer
(
    '00000000-0000-0000-0000-000000000005',
    'claire.torres@ev-install.co.uk',
    'Claire Torres',
    'Claire T.',
    '+447722123005',
    '{installer}',
    'active', 'verified', NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '91 days',
    NULL, NULL,
    'standard'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- HOST PROFILES
-- ============================================================

INSERT INTO host_profiles (
    id, user_id,
    stripe_connect_account_id, stripe_connect_onboarded,
    total_listings, total_sessions_hosted,
    commission_rate_pct
) VALUES
(
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004',
    'acct_test_andy001', TRUE,
    3, 47, 15.00
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- INSTALLER PROFILE
-- ============================================================

INSERT INTO installer_profiles (
    id, user_id,
    business_name, bio,
    ozev_certified, niceic_registered, napit_registered,
    coverage_postcodes, coverage_radius_km,
    service_categories, hourly_rate_pence, call_out_fee_pence,
    is_verified, total_jobs, average_rating, review_count,
    accepting_work, base_postcode
) VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000005',
    'Torres EV Install Ltd',
    'OZEV-certified EV charger installer covering London and the South East. Over 200 home and commercial installs since 2021.',
    TRUE, TRUE, FALSE,
    ARRAY['SW', 'SE', 'W', 'EC', 'WC', 'N', 'NW', 'E'],
    25,
    ARRAY['home_install', 'commercial_install', 'load_balancing', 'solar_integration'],
    9500, 5500,
    TRUE, 12, 4.9, 11,
    TRUE, 'SW1A 1AA'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ADDITIONAL CHARGER LISTINGS (UK — diverse)
-- ============================================================

INSERT INTO charger_listings (
    id, host_profile_id,
    title, description,
    address_line1, city, postal_code, country_code,
    latitude, longitude,
    charger_level, plug_types, max_power_kw,
    charger_brand, charger_model,
    ocpp_charge_point_id, is_smart_charger,
    pricing_model, price_per_kwh_cents, idle_fee_per_min_cents,
    access_type, access_instructions,
    instant_book_enabled, status,
    average_rating, review_count,
    min_booking_hours, max_booking_hours, buffer_minutes,
    wifi_available, shelter_available, ev_parking_only
) VALUES

-- London: Chelsea terrace Level 2
(
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Level 2 in Chelsea Terrace Driveway',
    'Quiet residential driveway in the heart of Chelsea. Easee charger, always reliable. Café and shops 2 minutes walk.',
    '14 Royal Avenue', 'London', 'SW3 4QP', 'GB',
    51.4889, -0.1637,
    'level_2', ARRAY['type_2'], 7.4,
    'Easee', 'Easee One', 'ZIPGRID-LON-001', TRUE,
    'per_kwh', 33, 8,
    'gate_code', NULL,
    TRUE, 'active',
    4.8, 7,
    0.5, 8.0, 15,
    TRUE, FALSE, TRUE
),

-- Manchester: Didsbury residential Level 2
(
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    'Fast EV Charge — Didsbury Suburb',
    'Level 2 7kW on a quiet residential street in South Manchester. Zappi charger supports solar diversion if you have panels.',
    '22 Warburton Street', 'Manchester', 'M20 5PG', 'GB',
    53.4182, -2.2261,
    'level_2', ARRAY['type_2', 'tethered_type_2'], 7.0,
    'Myenergi', 'Zappi 2', 'ZIPGRID-MCR-001', TRUE,
    'per_kwh', 29, 0,
    'always_open', NULL,
    TRUE, 'active',
    4.7, 12,
    0.5, 12.0, 10,
    FALSE, TRUE, FALSE
),

-- Edinburgh: New Town Level 2
(
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Georgian New Town Charge Point',
    'Period property in Edinburgh New Town with a modern 7.4kW Ohme charger. Only 10 min walk from the Royal Mile.',
    '8 Nelson Street', 'Edinburgh', 'EH3 6LF', 'GB',
    55.9587, -3.1926,
    'level_2', ARRAY['type_2'], 7.4,
    'Ohme', 'Ohme Home Pro', 'ZIPGRID-EDI-001', TRUE,
    'per_kwh', 28, 5,
    'buzz_in', NULL,
    FALSE, 'active',
    4.9, 5,
    1.0, 8.0, 20,
    TRUE, FALSE, TRUE
),

-- Bristol: Clifton Level 2
(
    '50000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000002',
    'Clifton Village 7kW Home Charger',
    'Near Clifton Suspension Bridge. EO Mini Pro 3. Secure driveway, no street parking hassle.',
    '5 Canynge Road', 'Bristol', 'BS8 3LH', 'GB',
    51.4574, -2.6250,
    'level_2', ARRAY['type_2'], 7.4,
    'EO Charging', 'EO Mini Pro 3', 'ZIPGRID-BRS-001', TRUE,
    'per_kwh', 31, 0,
    'gate_code', NULL,
    TRUE, 'active',
    4.6, 9,
    0.5, 10.0, 10,
    TRUE, FALSE, FALSE
),

-- Leeds: Headingley Level 2
(
    '50000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000002',
    'Headingley Terrace — 7kW Level 2',
    'Close to Hyde Park and Headingley stadium. Great for overnight charges. Pod Point Solo charger.',
    '18 Cardigan Road', 'Leeds', 'LS6 3AG', 'GB',
    53.8155, -1.5664,
    'level_2', ARRAY['type_2'], 7.0,
    'Pod Point', 'Solo 3', 'ZIPGRID-LDS-001', TRUE,
    'per_kwh', 27, 0,
    'always_open', NULL,
    TRUE, 'active',
    4.5, 4,
    0.5, 12.0, 10,
    FALSE, FALSE, FALSE
),

-- Birmingham: Moseley Level 2
(
    '50000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000002',
    'Moseley Village Fast Charger',
    'Level 2 in a safe enclosed parking bay. Andersen A3 — the premium UK charger. 5-star rated neighbourhood.',
    '37 Oxford Road', 'Birmingham', 'B13 9EH', 'GB',
    52.4402, -1.8863,
    'level_2', ARRAY['type_2', 'tethered_type_2'], 7.4,
    'Andersen', 'Andersen A3', 'ZIPGRID-BHM-001', TRUE,
    'per_kwh', 30, 8,
    'gate_code', NULL,
    TRUE, 'active',
    4.8, 8,
    0.5, 8.0, 15,
    TRUE, TRUE, TRUE
),

-- Oxford: Jericho Level 2
(
    '50000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    'Jericho Oxford — Level 2 7kW',
    'Residential street in the sought-after Jericho neighbourhood. Walkable to town centre. Rolec unit.',
    '12 Cardigan Street', 'Oxford', 'OX2 6AY', 'GB',
    51.7576, -1.2647,
    'level_2', ARRAY['type_2'], 7.4,
    'Rolec', 'Rolec WallPod', 'ZIPGRID-OXF-001', TRUE,
    'per_kwh', 32, 0,
    'always_open', NULL,
    TRUE, 'active',
    5.0, 3,
    0.5, 8.0, 10,
    TRUE, FALSE, FALSE
),

-- Cambridge: Newnham Level 2
(
    '50000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000001',
    'Cambridge Newnham — 11kW 3-Phase',
    '3-phase 11kW charger — faster than most home installs. Modern detached property with private drive.',
    '4 Grantchester Meadows', 'Cambridge', 'CB3 9JL', 'GB',
    52.1918, 0.1112,
    'level_2', ARRAY['type_2', 'ccs_2'], 11.0,
    'Wallbox', 'Pulsar Plus', 'ZIPGRID-CAM-001', TRUE,
    'per_kwh', 36, 10,
    'gate_code', NULL,
    TRUE, 'active',
    4.9, 6,
    0.5, 8.0, 15,
    TRUE, TRUE, TRUE
),

-- Brighton: Kemptown Level 2
(
    '50000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000002',
    'Brighton Kemptown — Seaside Level 2',
    'Perfect for beach day charging. Covered bay, 7.4kW, great for long sessions. Near Brighton Marina.',
    '22 St Georges Road', 'Brighton', 'BN2 1EB', 'GB',
    50.8233, -0.1212,
    'level_2', ARRAY['type_2'], 7.4,
    'Ohme', 'Ohme ePod', 'ZIPGRID-BTN-001', TRUE,
    'per_kwh', 34, 0,
    'always_open', NULL,
    TRUE, 'active',
    4.7, 11,
    0.5, 12.0, 10,
    FALSE, TRUE, FALSE
),

-- Glasgow: West End DC Fast Charger
(
    '50000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000002',
    'Glasgow West End — 50kW DC Fast',
    'One of the few privately-owned DC fast chargers. 50kW CCS. In and out in 30 minutes. Leafy West End location.',
    '9 Gibson Street', 'Glasgow', 'G12 8NU', 'GB',
    55.8706, -4.2843,
    'dc_fast', ARRAY['ccs_2', 'chademo'], 50.0,
    'Kempower', 'Kempower Satellite', 'ZIPGRID-GLA-001', TRUE,
    'per_kwh', 45, 20,
    'app_unlock', NULL,
    TRUE, 'active',
    4.6, 14,
    0.25, 2.0, 5,
    FALSE, TRUE, TRUE
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- WALLET TRANSACTIONS (Marcus — top-up + session spend)
-- ============================================================

-- Wallet balance (upsert)
INSERT INTO wallet_balances (
    user_id, balance_pence, pending_pence,
    auto_topup_enabled, auto_topup_threshold_pence, auto_topup_amount_pence,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    1250, 0,
    TRUE, 500, 2000,
    NOW() - INTERVAL '2 days'
)
ON CONFLICT (user_id) DO UPDATE
    SET balance_pence = EXCLUDED.balance_pence,
        auto_topup_enabled = EXCLUDED.auto_topup_enabled,
        updated_at = EXCLUDED.updated_at;

-- Top-up: Marcus added £20
INSERT INTO wallet_transactions (
    id, user_id, type, amount_pence, balance_after_pence,
    description, stripe_pi_id, created_at
) VALUES (
    'b1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'topup', 2000, 2000,
    'Wallet top-up', 'pi_test_wallet_topup_001',
    NOW() - INTERVAL '7 days'
)
ON CONFLICT (id) DO NOTHING;

-- Session payment: £7.50 for an Austin session
INSERT INTO wallet_transactions (
    id, user_id, type, amount_pence, balance_after_pence,
    description, booking_id, created_at
) VALUES (
    'b1000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    'session_payment', -750, 1250,
    'Charging session — Austin Rainey St',
    '70000000-0000-0000-0000-000000000001',  -- booking from seed 001
    NOW() - INTERVAL '3 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- REWARD BALANCE + TRANSACTIONS (Marcus)
-- ============================================================

INSERT INTO reward_balances (
    user_id, total_points, lifetime_points,
    current_tier, tier_qualifying_pts, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    680, 680, 'standard', 680, NOW() - INTERVAL '1 day'
)
ON CONFLICT (user_id) DO UPDATE
    SET total_points = EXCLUDED.total_points,
        lifetime_points = EXCLUDED.lifetime_points,
        updated_at = EXCLUDED.updated_at;

-- Welcome bonus
INSERT INTO reward_points (
    user_id, action, points, multiplier,
    description, expires_at, created_at
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    'welcome_bonus', 200, 1.0,
    'Welcome to Zipgrid!',
    NOW() + INTERVAL '12 months',
    NOW() - INTERVAL '14 days'
),
-- Session completed earn
(
    '00000000-0000-0000-0000-000000000003',
    'session_completed', 480, 1.0,
    '23.2 kWh charged at SF listing',
    NOW() + INTERVAL '12 months',
    NOW() - INTERVAL '3 days'
)
ON CONFLICT DO NOTHING;

-- First session badge
INSERT INTO reward_badges (user_id, badge_type)
VALUES ('00000000-0000-0000-0000-000000000003', 'first_session')
ON CONFLICT DO NOTHING;

-- ============================================================
-- EMERGENCY SESSION
-- ============================================================

INSERT INTO emergency_sessions (
    id, driver_user_id, status,
    battery_pct, vehicle_id,
    driver_location, max_range_metres,
    nearest_listing_id, accepted_at,
    created_at, updated_at
) VALUES (
    'e0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'accepted',
    8,
    '20000000-0000-0000-0000-000000000002',  -- Marcus's Tesla
    ST_SetSRID(ST_MakePoint(-0.1278, 51.5074), 4326)::GEOGRAPHY,
    18000,  -- 18km range remaining
    '50000000-0000-0000-0000-000000000001',  -- Chelsea listing
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- INSTALLER JOB
-- ============================================================

INSERT INTO installer_jobs (
    id, installer_profile_id, client_user_id,
    service_category, title, description,
    address,
    status, quoted_price_pence,
    commission_rate_pct, platform_fee_pence, installer_net_pence,
    created_at, updated_at
) VALUES (
    'j0000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',  -- Claire Torres
    '00000000-0000-0000-0000-000000000002',  -- Sarah Chen (as client)
    'home_install',
    'Install 22kW 3-phase charger — Chelsea home',
    'Upgrade existing single-phase 7kW to 3-phase 22kW with load balancing. Panel upgrade required.',
    '{"line1": "14 Royal Avenue", "city": "London", "postcode": "SW3 4QP"}'::jsonb,
    'pending',
    120000,  -- £1,200 quote
    12.00, 14400, 105600,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MARKETPLACE PRODUCTS
-- ============================================================

INSERT INTO marketplace_products (
    id, name, brand, category_slug,
    description, price_pence, currency,
    plug_types, max_power_kw,
    is_featured, stock_status,
    image_urls, created_at
) VALUES
(
    'p0000000-0000-0000-0000-000000000001',
    'Zappi 2 — 7kW EV Charger',
    'Myenergi',
    'home_charger',
    'The Zappi 2 is the UK''s best-selling smart EV charger. Solar-compatible, OCPP 1.6J, app-controlled.',
    79900,  -- £799
    'GBP',
    ARRAY['type_2'],
    7.0,
    TRUE, 'in_stock',
    ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800'],
    NOW() - INTERVAL '30 days'
),
(
    'p0000000-0000-0000-0000-000000000002',
    'EO Mini Pro 3 — 7.4kW',
    'EO Charging',
    'home_charger',
    'Sleek and compact. 7.4kW, tethered or untethered, OCPP, built-in load management.',
    74900,  -- £749
    'GBP',
    ARRAY['type_2', 'tethered_type_2'],
    7.4,
    FALSE, 'in_stock',
    ARRAY['https://images.unsplash.com/photo-1593941707874-ef25b8b4a92b?w=800'],
    NOW() - INTERVAL '30 days'
),
(
    'p0000000-0000-0000-0000-000000000003',
    'Kempower Satellite — 50kW DC',
    'Kempower',
    'commercial_charger',
    'Commercial-grade 50kW DC fast charger. CCS2 + CHAdeMO. OCPP 2.0.1, remote management.',
    1249900,  -- £12,499
    'GBP',
    ARRAY['ccs_2', 'chademo'],
    50.0,
    TRUE, 'available_to_order',
    ARRAY['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800'],
    NOW() - INTERVAL '30 days'
),
(
    'p0000000-0000-0000-0000-000000000004',
    'Type 2 Charging Cable — 5m 32A',
    'Cartek',
    'cable',
    'Universal Mode 3 Type 2 to Type 2 cable. 5-metre, 32A, 7.4kW max. IEC 62196-2 compliant.',
    6900,  -- £69
    'GBP',
    ARRAY['type_2'],
    7.4,
    FALSE, 'in_stock',
    ARRAY['https://images.unsplash.com/photo-1620714223084-8fcacc2d47c9?w=800'],
    NOW() - INTERVAL '30 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DISPUTE (open — for admin demo)
-- ============================================================

INSERT INTO disputes (
    id, raised_by_user_id, raised_against_user_id,
    booking_id, dispute_type, status,
    description, created_at, updated_at
) VALUES (
    'd0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',   -- Marcus raised it
    '00000000-0000-0000-0000-000000000002',   -- against Sarah
    '70000000-0000-0000-0000-000000000001',   -- the completed booking
    'billing',
    'open',
    'Session ended prematurely at 80% charge. Billed for full session duration but charger reported fault at 14:23.',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SAFETY SCORES (for the SF listing)
-- ============================================================

INSERT INTO safety_scores (
    id, listing_id,
    charger_age_score, rcd_protection_score, electrician_installed_score,
    ocpp_fault_rate_score, driver_complaints_score, platform_inspection_score,
    overall_score, score_band, calculated_at
) VALUES (
    'ss000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',  -- Chelsea listing
    90, 100, 95, 100, 95, 0,  -- platform inspection not done yet
    89, 'good',
    NOW() - INTERVAL '1 day'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- WEBHOOK SUBSCRIPTION (demo outbound webhook)
-- ============================================================

INSERT INTO webhook_subscriptions (
    id, user_id, endpoint_url,
    secret_hash, events, is_active,
    created_at, updated_at
) VALUES (
    'ws000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',  -- Andy Park (SMB)
    'https://webhook.site/zipgrid-demo-endpoint',
    'sha256:demo_secret_hash_not_real',
    ARRAY['session.completed', 'booking.confirmed', 'payout.paid'],
    TRUE,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
