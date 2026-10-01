-- ============================================================
-- Zipgrid Demo Seed 005 — Demo Bookings
-- ============================================================
-- Creates bookings across multiple statuses to populate every UI state:
--   - confirmed upcoming (Marcus at Sarah's)
--   - completed with full transaction (Marcus at Dev's)
--   - pending awaiting host approval (Andy at Edinburgh listing)
--   - cancelled_by_driver
-- Depends on: 003, 004.
-- ============================================================

BEGIN;

-- Booking 1: Marcus at Sarah's — confirmed, upcoming tomorrow
INSERT INTO bookings (
  id, listing_id, driver_profile_id, vehicle_id,
  scheduled_start, scheduled_end, duration_minutes,
  status, pricing_model,
  quoted_price_per_kwh_cents, quoted_idle_fee_per_min_cents,
  estimated_cost_cents,
  access_type, access_instructions, instant_book,
  driver_arrival_code, session_pin,
  confirmed_at, created_at, updated_at
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-2000-000000000003',
  '10000000-0000-0000-3000-000000000003',
  NOW() + INTERVAL '18 hours',
  NOW() + INTERVAL '20 hours 30 minutes',
  150,
  'confirmed', 'per_kwh',
  34, 10,
  714,
  'gate_code', 'Gate code: 4471. Press # first then the code.',
  true,
  '73841920', '941827',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Booking 2: Marcus at Dev's coworking — completed 3 days ago
INSERT INTO bookings (
  id, listing_id, driver_profile_id, vehicle_id,
  scheduled_start, scheduled_end, duration_minutes,
  status, pricing_model,
  quoted_price_per_kwh_cents, quoted_price_per_session_cents, quoted_idle_fee_per_min_cents,
  estimated_cost_cents,
  access_type, instant_book,
  driver_arrival_code, session_pin,
  confirmed_at, completed_at, created_at, updated_at
) VALUES (
  '30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-2000-000000000003',
  '10000000-0000-0000-3000-000000000003',
  NOW() - INTERVAL '3 days 4 hours',
  NOW() - INTERVAL '3 days 1 hour',
  180,
  'completed', 'hybrid',
  28, 100, 12,
  824,
  'app_unlock', true,
  '82930471', '384729',
  NOW() - INTERVAL '3 days 4 hours 5 minutes',
  NOW() - INTERVAL '3 days 1 hour',
  NOW() - INTERVAL '3 days 4 hours 10 minutes',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;

-- Booking 3: Andy at Edinburgh — pending approval
INSERT INTO bookings (
  id, listing_id, driver_profile_id, vehicle_id,
  scheduled_start, scheduled_end, duration_minutes,
  status, pricing_model,
  quoted_price_per_kwh_cents, quoted_idle_fee_per_min_cents,
  estimated_cost_cents,
  access_type, instant_book,
  driver_arrival_code, session_pin,
  created_at, updated_at
) VALUES (
  '30000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-2000-000000000004',
  '10000000-0000-0000-3000-000000000004',
  NOW() + INTERVAL '36 hours',
  NOW() + INTERVAL '39 hours',
  180,
  'pending', 'per_kwh',
  36, 10,
  612,
  'always_open', false,
  '91827364', '728391',
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Transaction for completed booking 2
INSERT INTO transactions (
  id, booking_id,
  stripe_payment_intent_id, status,
  subtotal_cents, platform_fee_cents, total_charged_cents, host_earnings_cents,
  commission_rate_pct, currency,
  hold_placed_at, captured_at, created_at, updated_at
) VALUES (
  '40000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  'pi_demo_marcus_dev_002',
  'captured',
  824, 124, 824, 700,
  15.00, 'GBP',
  NOW() - INTERVAL '3 days 4 hours 10 minutes',
  NOW() - INTERVAL '3 days 1 hour',
  NOW() - INTERVAL '3 days 4 hours 10 minutes',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;

COMMIT;
