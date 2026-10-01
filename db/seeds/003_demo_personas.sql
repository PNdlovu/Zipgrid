-- ============================================================
-- Zipgrid Demo Seed 003 — Full Persona Dataset
-- ============================================================
-- 5 fully-fleshed investor-demo personas per doc 3.13:
--   Sarah    — homeowner host (SW London, Zappi, 4 sessions/week)
--   Dev      — SMB host (co-working space, 3 chargers, dynamic pricing)
--   Marcus   — frequent driver (commuter, Tesla Model 3, Platinum rewards)
--   Andy     — occasional driver (Leaf, first booking in progress)
--   Claire   — certified OZEV installer (marketplace profile, 8 jobs)
--
-- Depends on: 001_seed.sql, 002_demo_extended.sql
-- All UUIDs are fixed for reliable deep-links in demo flows.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- USER: Sarah (Homeowner Host — SW London)
-- ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, full_name, display_name, roles, account_status, kyc_status,
  kyc_verified_at, email_verified_at, stripe_customer_id, stripe_connect_account_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'sarah.chen@demo.zipgrid.co.uk',
  'Sarah Chen',
  'Sarah C.',
  ARRAY['driver','host']::user_role[],
  'active', 'verified',
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '61 days',
  'cus_sarah_demo_001',
  'acct_sarah_connect_001',
  NOW() - INTERVAL '62 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO host_profiles (id, user_id, business_type, stripe_onboarding_complete,
  identity_verified, total_earnings_cents, total_sessions_hosted, average_rating, review_count, created_at)
VALUES (
  '10000000-0000-0000-1000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'individual', true, true, 189400, 47, 4.9, 31,
  NOW() - INTERVAL '62 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO driver_profiles (id, user_id, total_sessions, total_kwh_consumed, average_rating, review_count, created_at)
VALUES (
  '10000000-0000-0000-2000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  12, 187.4, 4.8, 9,
  NOW() - INTERVAL '62 days'
) ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- USER: Dev (SMB Host — co-working space, Manchester)
-- ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, full_name, display_name, roles, account_status, kyc_status,
  kyc_verified_at, email_verified_at, stripe_customer_id, stripe_connect_account_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'dev.patel@demo.zipgrid.co.uk',
  'Dev Patel',
  'Dev P.',
  ARRAY['host']::user_role[],
  'active', 'verified',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '46 days',
  'cus_dev_demo_002',
  'acct_dev_connect_002',
  NOW() - INTERVAL '47 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO host_profiles (id, user_id, business_type, business_name, stripe_onboarding_complete,
  identity_verified, total_earnings_cents, total_sessions_hosted, average_rating, review_count, created_at)
VALUES (
  '10000000-0000-0000-1000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'business', 'Nexus Coworking Manchester',
  true, true, 421600, 109, 4.7, 68,
  NOW() - INTERVAL '47 days'
) ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- USER: Marcus (Frequent Driver — London commuter, Tesla Model 3)
-- ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, full_name, display_name, roles, account_status, kyc_status,
  kyc_verified_at, email_verified_at, stripe_customer_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'marcus.wright@demo.zipgrid.co.uk',
  'Marcus Wright',
  'Marcus W.',
  ARRAY['driver']::user_role[],
  'active', 'verified',
  NOW() - INTERVAL '90 days',
  NOW() - INTERVAL '91 days',
  'cus_marcus_demo_003',
  NOW() - INTERVAL '92 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO driver_profiles (id, user_id, total_sessions, total_kwh_consumed, average_rating, review_count, created_at)
VALUES (
  '10000000-0000-0000-2000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  84, 2156.8, 4.9, 61,
  NOW() - INTERVAL '92 days'
) ON CONFLICT (id) DO NOTHING;

-- Marcus's Tesla Model 3 Long Range
INSERT INTO driver_vehicles (id, driver_profile_id, make, model, year,
  plug_types, battery_capacity_kwh, range_miles_wltp, is_primary, is_active, created_at)
VALUES (
  '10000000-0000-0000-3000-000000000003',
  '10000000-0000-0000-2000-000000000003',
  'Tesla', 'Model 3 Long Range', 2024,
  ARRAY['type_2','ccs_2']::plug_type[],
  82.0, 358,
  true, true,
  NOW() - INTERVAL '90 days'
) ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- USER: Andy (Occasional Driver — Nissan Leaf, Bristol)
-- ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, full_name, display_name, roles, account_status, kyc_status,
  kyc_verified_at, email_verified_at, stripe_customer_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'andy.okafor@demo.zipgrid.co.uk',
  'Andy Okafor',
  'Andy O.',
  ARRAY['driver']::user_role[],
  'active', 'verified',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '7 days',
  'cus_andy_demo_004',
  NOW() - INTERVAL '8 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO driver_profiles (id, user_id, total_sessions, total_kwh_consumed, average_rating, review_count, created_at)
VALUES (
  '10000000-0000-0000-2000-000000000004',
  '10000000-0000-0000-0000-000000000004',
  1, 28.5, 0.0, 0,
  NOW() - INTERVAL '8 days'
) ON CONFLICT (id) DO NOTHING;

-- Andy's Nissan Leaf (40 kWh)
INSERT INTO driver_vehicles (id, driver_profile_id, make, model, year,
  plug_types, battery_capacity_kwh, range_miles_wltp, is_primary, is_active, created_at)
VALUES (
  '10000000-0000-0000-3000-000000000004',
  '10000000-0000-0000-2000-000000000004',
  'Nissan', 'Leaf', 2022,
  ARRAY['type_2','chademo']::plug_type[],
  40.0, 168,
  true, true,
  NOW() - INTERVAL '7 days'
) ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- USER: Claire (OZEV Installer — Birmingham)
-- ──────────────────────────────────────────────────────────────
INSERT INTO users (id, email, full_name, display_name, roles, account_status, kyc_status,
  kyc_verified_at, email_verified_at, stripe_customer_id, stripe_connect_account_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000005',
  'claire.installer@demo.zipgrid.co.uk',
  'Claire Nkosi',
  'Claire N.',
  ARRAY['installer']::user_role[],
  'active', 'verified',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '31 days',
  'cus_claire_demo_005',
  'acct_claire_connect_005',
  NOW() - INTERVAL '32 days'
) ON CONFLICT (id) DO NOTHING;

COMMIT;
