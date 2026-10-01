-- ============================================================
-- Zipgrid Demo Seed 006 — Demo Sessions
-- ============================================================
-- Creates charging sessions corresponding to bookings in seed 005:
--   - completed session with full meter data (Marcus at Dev's)
--   - active/charging session for live demo (Marcus at upcoming booking)
-- Depends on: 005_demo_bookings.sql
-- ============================================================

BEGIN;

-- Session for completed booking (Marcus at Dev's coworking)
INSERT INTO charging_sessions (
  id, booking_id, charge_point_id, connector_id,
  status, ocpp_id_tag, ocpp_transaction_id,
  energy_consumed_wh, peak_power_w, power_w, soc_percent,
  total_cost_pence, price_per_kwh_cents, pricing_model, idle_fee_per_min_cents,
  started_at, ended_at, duration_minutes,
  created_at, updated_at
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'DEV-NEXUS-001',
  1,
  'completed',
  'ZG-10000000-0000-0000-2000-000000000003',
  10042,
  26400,    -- 26.4 kWh delivered
  7100,     -- 7.1 kW peak
  0,        -- power = 0 (session over)
  92,       -- 92% SoC at end
  824,      -- £8.24 final cost
  28, 'hybrid', 12,
  NOW() - INTERVAL '3 days 4 hours',
  NOW() - INTERVAL '3 days 1 hour',
  180,
  NOW() - INTERVAL '3 days 4 hours 5 minutes',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;

-- OCPP meter value snapshots for the completed session
INSERT INTO session_meter_values (
  id, session_id, timestamp,
  energy_wh, power_w, soc_percent, voltage_v, current_a
) VALUES
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 4 hours',        0,     6800, 28, 237, 28.7),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours 55 min', 5800,  7100, 39, 238, 29.9),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours 40 min', 12300, 7000, 55, 237, 29.5),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours 20 min', 19100, 6200, 72, 237, 26.2),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours',        24600, 3800, 86, 236, 16.1),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 1 hour',         26400, 0,    92, 230, 0.0)
ON CONFLICT DO NOTHING;

COMMIT;
