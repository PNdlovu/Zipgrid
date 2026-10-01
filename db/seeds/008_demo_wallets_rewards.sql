-- ============================================================
-- Zipgrid Demo Seed 008 — Demo Wallets & Rewards
-- ============================================================
-- Populates wallet balances, transaction history, reward points,
-- reward balances, badges, and Driver Plus subscription for the
-- 5 investor-demo personas.
--
-- Persona UUID prefix reference:
--   Sarah  (host+driver)  10000000-0000-0000-0000-000000000001
--   Dev    (smb host)      10000000-0000-0000-0000-000000000002
--   Marcus (frequent driver, Platinum) 10000000-0000-0000-0000-000000000003
--   Andy   (new driver)   10000000-0000-0000-0000-000000000004
--   Claire (installer)    10000000-0000-0000-0000-000000000005
--
-- Depends on: 003_demo_personas.sql, 005_demo_bookings.sql, 006_demo_sessions.sql
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- WALLET BALANCES
-- ──────────────────────────────────────────────────────────────

-- Sarah: host earnings + some personal wallet credit
INSERT INTO wallet_balances (user_id, balance_pence, pending_pence,
  auto_topup_enabled, auto_topup_threshold_pence, auto_topup_amount_pence,
  stripe_customer_id, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  3250, 0,
  true, 500, 2000,
  'cus_sarah_demo_001',
  NOW() - INTERVAL '1 day'
) ON CONFLICT (user_id) DO UPDATE SET
  balance_pence = EXCLUDED.balance_pence,
  pending_pence = EXCLUDED.pending_pence,
  auto_topup_enabled = EXCLUDED.auto_topup_enabled,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  updated_at = EXCLUDED.updated_at;

-- Dev: large SMB wallet with pending payout
INSERT INTO wallet_balances (user_id, balance_pence, pending_pence,
  auto_topup_enabled, stripe_customer_id, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  12400, 4200,
  false, 'cus_dev_demo_002',
  NOW() - INTERVAL '12 hours'
) ON CONFLICT (user_id) DO UPDATE SET
  balance_pence = EXCLUDED.balance_pence,
  pending_pence = EXCLUDED.pending_pence,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  updated_at = EXCLUDED.updated_at;

-- Marcus: active Driver Plus subscriber, healthy wallet balance
INSERT INTO wallet_balances (user_id, balance_pence, pending_pence,
  auto_topup_enabled, auto_topup_threshold_pence, auto_topup_amount_pence,
  stripe_customer_id, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  5800, 0,
  true, 1000, 5000,
  'cus_marcus_demo_003',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (user_id) DO UPDATE SET
  balance_pence = EXCLUDED.balance_pence,
  auto_topup_enabled = EXCLUDED.auto_topup_enabled,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  updated_at = EXCLUDED.updated_at;

-- Andy: new driver, small welcome credit applied
INSERT INTO wallet_balances (user_id, balance_pence, pending_pence,
  auto_topup_enabled, stripe_customer_id, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  500, 0,
  false, 'cus_andy_demo_004',
  NOW() - INTERVAL '8 days'
) ON CONFLICT (user_id) DO UPDATE SET
  balance_pence = EXCLUDED.balance_pence,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  updated_at = EXCLUDED.updated_at;

-- Claire: installer, minimal wallet (earns via marketplace payouts)
INSERT INTO wallet_balances (user_id, balance_pence, pending_pence,
  auto_topup_enabled, stripe_customer_id, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000005',
  0, 0,
  false, 'cus_claire_demo_005',
  NOW() - INTERVAL '30 days'
) ON CONFLICT (user_id) DO UPDATE SET
  balance_pence = EXCLUDED.balance_pence,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  updated_at = EXCLUDED.updated_at;


-- ──────────────────────────────────────────────────────────────
-- WALLET TRANSACTIONS
-- ──────────────────────────────────────────────────────────────

-- Sarah: top-up 2 weeks ago
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence, description, created_at)
VALUES (
  '70000000-0000-0000-0001-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'topup', 5000, 5000,
  'Wallet top-up via card',
  NOW() - INTERVAL '14 days'
) ON CONFLICT (id) DO NOTHING;

-- Sarah: session_payment from her own booking (as driver)
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  description, created_at)
VALUES (
  '70000000-0000-0000-0001-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'session_payment', -480, 4520,
  'Charging session at Nexus Coworking',
  NOW() - INTERVAL '10 days'
) ON CONFLICT (id) DO NOTHING;

-- Sarah: reward redemption credit
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  description, created_at)
VALUES (
  '70000000-0000-0000-0001-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'reward_redemption', 270, 4790,
  '540 ZipPoints redeemed (1pt = £0.005)',
  NOW() - INTERVAL '7 days'
) ON CONFLICT (id) DO NOTHING;

-- Sarah: session_payment deduction
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  description, created_at)
VALUES (
  '70000000-0000-0000-0001-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'session_payment', -1540, 3250,
  'Charging session — Marcus Wright',
  NOW() - INTERVAL '1 day'
) ON CONFLICT (id) DO NOTHING;

-- Marcus: top-up 4 weeks ago (large — auto top-up threshold = £10)
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  stripe_pi_id, description, created_at)
VALUES (
  '70000000-0000-0000-0003-000000000001',
  '10000000-0000-0000-0000-000000000003',
  'topup', 10000, 10000,
  'pi_demo_marcus_topup_001',
  'Wallet top-up via card — auto top-up',
  NOW() - INTERVAL '28 days'
) ON CONFLICT (id) DO NOTHING;

-- Marcus: welcome bonus
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  description, created_at)
VALUES (
  '70000000-0000-0000-0003-000000000002',
  '10000000-0000-0000-0000-000000000003',
  'promotional', 500, 10500,
  'Welcome bonus — first booking on Zipgrid',
  NOW() - INTERVAL '92 days'
) ON CONFLICT (id) DO NOTHING;

-- Marcus: completed session payment (booking 2 — Dev's coworking)
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  booking_id, description, created_at)
VALUES (
  '70000000-0000-0000-0003-000000000003',
  '10000000-0000-0000-0000-000000000003',
  'session_payment', -824, 5800,
  '30000000-0000-0000-0000-000000000002',
  'Charging session at Nexus Coworking Manchester',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;

-- Andy: promotional welcome credit
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  description, created_at)
VALUES (
  '70000000-0000-0000-0004-000000000001',
  '10000000-0000-0000-0000-000000000004',
  'promotional', 500, 500,
  'Welcome credit — thanks for joining Zipgrid!',
  NOW() - INTERVAL '8 days'
) ON CONFLICT (id) DO NOTHING;

-- Dev: top-up to cover multi-charger float
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  stripe_pi_id, description, created_at)
VALUES (
  '70000000-0000-0000-0002-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'topup', 20000, 20000,
  'pi_demo_dev_topup_001',
  'SMB wallet top-up — business account',
  NOW() - INTERVAL '30 days'
) ON CONFLICT (id) DO NOTHING;

-- Dev: large session earnings credit (from hosting sessions)
INSERT INTO wallet_transactions (id, user_id, type, amount_pence, balance_after_pence,
  description, created_at)
VALUES (
  '70000000-0000-0000-0002-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'session_payment', -7600, 12400,
  'Weekly platform usage — 3 chargers, 38 sessions',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- REWARD POINTS LEDGER
-- ──────────────────────────────────────────────────────────────

-- Marcus — Platinum driver: rich reward history

-- Welcome bonus
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'welcome_bonus', 250, 1.00,
  'Welcome to Zipgrid — first booking bonus',
  NOW() - INTERVAL '92 days'
) ON CONFLICT DO NOTHING;

-- 84 completed sessions — batch summary entry (historical)
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'session_completed', 8400, 1.50,
  '84 completed charging sessions (1.5× Platinum multiplier)',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT DO NOTHING;

-- Review submitted
INSERT INTO reward_points (user_id, action, points, multiplier,
  booking_id, description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'review_submitted', 50, 1.00,
  '30000000-0000-0000-0000-000000000002',
  'Review submitted for Nexus Coworking',
  NOW() - INTERVAL '3 days'
) ON CONFLICT DO NOTHING;

-- Off-peak bonus (completed session ended at night)
INSERT INTO reward_points (user_id, action, points, multiplier,
  session_id, description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'off_peak_bonus', 100, 1.50,
  '50000000-0000-0000-0000-000000000001',
  'Off-peak charging bonus (23:00–07:00) × Platinum',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT DO NOTHING;

-- 4-week streak bonus
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'streak_bonus', 500, 1.50,
  '4-week consecutive charging streak — Platinum × 1.5',
  NOW() - INTERVAL '7 days'
) ON CONFLICT DO NOTHING;

-- Points redeemed for wallet credit (540 → £2.70)
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'redemption', -540, 1.00,
  '540 ZipPoints redeemed as wallet credit (£2.70)',
  NOW() - INTERVAL '5 days'
) ON CONFLICT DO NOTHING;

-- Sarah — driver rewards
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'welcome_bonus', 250, 1.00,
  'Welcome to Zipgrid — first booking bonus',
  NOW() - INTERVAL '62 days'
) ON CONFLICT DO NOTHING;

INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'session_completed', 1200, 1.00,
  '12 completed charging sessions as driver',
  NOW() - INTERVAL '1 day'
) ON CONFLICT DO NOTHING;

INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'host_session_earned', 4700, 1.20,
  '47 sessions hosted (Silver × 1.2 multiplier)',
  NOW() - INTERVAL '1 day'
) ON CONFLICT DO NOTHING;

-- Sarah: redeemed some points
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'redemption', -540, 1.00,
  '540 ZipPoints redeemed as wallet credit (£2.70)',
  NOW() - INTERVAL '7 days'
) ON CONFLICT DO NOTHING;

-- Andy — new driver: just welcome bonus
INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'welcome_bonus', 250, 1.00,
  'Welcome to Zipgrid — first booking bonus',
  NOW() - INTERVAL '8 days'
) ON CONFLICT DO NOTHING;

INSERT INTO reward_points (user_id, action, points, multiplier,
  description, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'session_completed', 100, 1.00,
  'First charging session completed',
  NOW() - INTERVAL '6 days'
) ON CONFLICT DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- REWARD BALANCES (denormalised totals)
-- Normally maintained by trigger; set explicitly for demo data.
-- ──────────────────────────────────────────────────────────────

INSERT INTO reward_balances (user_id, total_points, lifetime_points,
  current_tier, tier_qualifying_pts, tier_reviewed_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  9270, 9810, 'platinum', 9810,
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '3 days'
) ON CONFLICT (user_id) DO UPDATE SET
  total_points        = EXCLUDED.total_points,
  lifetime_points     = EXCLUDED.lifetime_points,
  current_tier        = EXCLUDED.current_tier,
  tier_qualifying_pts = EXCLUDED.tier_qualifying_pts,
  tier_reviewed_at    = EXCLUDED.tier_reviewed_at,
  updated_at          = EXCLUDED.updated_at;

INSERT INTO reward_balances (user_id, total_points, lifetime_points,
  current_tier, tier_qualifying_pts, tier_reviewed_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  5610, 6150, 'silver', 5880,
  NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '1 day'
) ON CONFLICT (user_id) DO UPDATE SET
  total_points        = EXCLUDED.total_points,
  lifetime_points     = EXCLUDED.lifetime_points,
  current_tier        = EXCLUDED.current_tier,
  tier_qualifying_pts = EXCLUDED.tier_qualifying_pts,
  updated_at          = EXCLUDED.updated_at;

INSERT INTO reward_balances (user_id, total_points, lifetime_points,
  current_tier, tier_qualifying_pts, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  350, 350, 'standard', 350,
  NOW() - INTERVAL '6 days'
) ON CONFLICT (user_id) DO UPDATE SET
  total_points    = EXCLUDED.total_points,
  lifetime_points = EXCLUDED.lifetime_points,
  updated_at      = EXCLUDED.updated_at;

INSERT INTO reward_balances (user_id, total_points, lifetime_points,
  current_tier, tier_qualifying_pts, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  2100, 2100, 'silver', 2100,
  NOW()
) ON CONFLICT (user_id) DO UPDATE SET
  total_points    = EXCLUDED.total_points,
  lifetime_points = EXCLUDED.lifetime_points,
  current_tier    = EXCLUDED.current_tier,
  updated_at      = EXCLUDED.updated_at;


-- ──────────────────────────────────────────────────────────────
-- REWARD BADGES
-- ──────────────────────────────────────────────────────────────

-- Marcus — Platinum power user badges
INSERT INTO reward_badges (user_id, badge_type, earned_at) VALUES
  ('10000000-0000-0000-0000-000000000003', 'first_session',      NOW() - INTERVAL '92 days'),
  ('10000000-0000-0000-0000-000000000003', 'kwh_500',            NOW() - INTERVAL '60 days'),
  ('10000000-0000-0000-0000-000000000003', 'kwh_2000',           NOW() - INTERVAL '5 days'),
  ('10000000-0000-0000-0000-000000000003', 'co2_100kg',          NOW() - INTERVAL '45 days'),
  ('10000000-0000-0000-0000-000000000003', 'streak_4week',       NOW() - INTERVAL '7 days'),
  ('10000000-0000-0000-0000-000000000003', 'sessions_50',        NOW() - INTERVAL '30 days'),
  ('10000000-0000-0000-0000-000000000003', 'sessions_75',        NOW() - INTERVAL '10 days'),
  ('10000000-0000-0000-0000-000000000003', 'off_peak_hero',      NOW() - INTERVAL '14 days'),
  ('10000000-0000-0000-0000-000000000003', 'platinum_tier',      NOW() - INTERVAL '7 days')
ON CONFLICT (user_id, badge_type) DO NOTHING;

-- Sarah — host + driver badges
INSERT INTO reward_badges (user_id, badge_type, earned_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 'first_session',      NOW() - INTERVAL '62 days'),
  ('10000000-0000-0000-0000-000000000001', 'first_host_session', NOW() - INTERVAL '58 days'),
  ('10000000-0000-0000-0000-000000000001', 'host_sessions_25',   NOW() - INTERVAL '20 days'),
  ('10000000-0000-0000-0000-000000000001', 'host_sessions_50',   NOW() - INTERVAL '5 days'),
  ('10000000-0000-0000-0000-000000000001', 'co2_50kg',           NOW() - INTERVAL '30 days'),
  ('10000000-0000-0000-0000-000000000001', 'silver_tier',        NOW() - INTERVAL '14 days')
ON CONFLICT (user_id, badge_type) DO NOTHING;

-- Andy — newcomer badge
INSERT INTO reward_badges (user_id, badge_type, earned_at) VALUES
  ('10000000-0000-0000-0000-000000000004', 'first_session',      NOW() - INTERVAL '6 days')
ON CONFLICT (user_id, badge_type) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- DRIVER PLUS SUBSCRIPTION (Marcus)
-- Active annual plan — shows upsell success in investor demo
-- ──────────────────────────────────────────────────────────────

INSERT INTO driver_subscriptions (
  id, user_id,
  stripe_subscription_id, stripe_price_id,
  plan_name, price_pence_per_period, billing_period,
  status, trial_end,
  current_period_start, current_period_end,
  cancel_at_period_end,
  advance_booking_days, fee_discount_pct,
  created_at, updated_at
) VALUES (
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  'sub_marcus_driverplus_001',
  'price_driver_plus_monthly_gbp',
  'driver_plus', 699, 'monthly',
  'active', NULL,
  NOW() - INTERVAL '30 days',
  NOW() + INTERVAL '1 day',
  false,
  14, 10,
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '30 days'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- USER REFERRALS
-- Marcus referred Andy — pending (Andy completed 1 session, 
-- but referral credit hasn't triggered yet for demo freshness)
-- ──────────────────────────────────────────────────────────────

INSERT INTO user_referrals (
  id, referrer_user_id, referee_user_id,
  referral_code, status, credit_pence,
  expires_at, created_at
) VALUES (
  '90000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004',
  'MARCUS2024',
  'pending',
  500,
  NOW() + INTERVAL '82 days',
  NOW() - INTERVAL '8 days'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- ESG / CARBON DATA (Marcus — rich carbon history)
-- ──────────────────────────────────────────────────────────────

-- Carbon record for completed session (session 001)
INSERT INTO session_carbon_records (
  session_id, user_id,
  energy_wh, grid_intensity_gco2_per_kwh,
  co2_saved_grams, km_equivalent, tree_hours_equivalent,
  region_code, grid_provider, recorded_at
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  26400,
  183.2,          -- UK grid average at session time (g CO2e/kWh)
  3168,           -- ~3.2 kg CO2 saved vs petrol equivalent
  225.6,          -- ~226 km petrol equivalent
  18.4,           -- tree absorption hours equivalent
  'GB-NW',        -- North West England
  'National Grid ESO',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT DO NOTHING;

-- Cumulative ESG totals for Marcus (84 sessions, 2,156 kWh)
INSERT INTO user_esg_totals (
  user_id, total_energy_wh, total_co2_saved_grams,
  total_sessions, total_km_equivalent, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  2156800,        -- 2,156.8 kWh lifetime
  258816,         -- ~259 kg CO2 saved
  84,
  18000.50,       -- ~18,000 km petrol equivalent
  NOW() - INTERVAL '3 days'
) ON CONFLICT (user_id) DO UPDATE SET
  total_energy_wh       = EXCLUDED.total_energy_wh,
  total_co2_saved_grams = EXCLUDED.total_co2_saved_grams,
  total_sessions        = EXCLUDED.total_sessions,
  total_km_equivalent   = EXCLUDED.total_km_equivalent,
  updated_at            = EXCLUDED.updated_at;

-- Sarah's ESG totals (12 sessions, 187 kWh)
INSERT INTO user_esg_totals (
  user_id, total_energy_wh, total_co2_saved_grams,
  total_sessions, total_km_equivalent, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  187400, 22488, 12, 1598.20,
  NOW() - INTERVAL '1 day'
) ON CONFLICT (user_id) DO UPDATE SET
  total_energy_wh       = EXCLUDED.total_energy_wh,
  total_co2_saved_grams = EXCLUDED.total_co2_saved_grams,
  total_sessions        = EXCLUDED.total_sessions,
  total_km_equivalent   = EXCLUDED.total_km_equivalent,
  updated_at            = EXCLUDED.updated_at;

-- Platform totals (reflects combined demo dataset)
UPDATE platform_esg_totals SET
  total_sessions         = 156,
  total_energy_kwh       = 3812.4,
  total_co2_saved_tonnes = 0.4574,
  total_km_equivalent    = 32400,
  unique_drivers         = 4,
  last_calculated_at     = NOW()
WHERE id = 1;

COMMIT;
