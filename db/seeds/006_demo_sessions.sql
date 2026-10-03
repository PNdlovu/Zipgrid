-- ============================================================
-- Zipgrid Demo Seed 006 — Demo Sessions
-- ============================================================
-- Creates charging sessions corresponding to bookings in seed 005:
--   - completed session with full meter data (Marcus at Dev's)
-- Energy is meter_stop_wh − meter_start_wh (energy_consumed_wh is generated).
-- Depends on: 005_demo_bookings.sql
-- ============================================================

BEGIN;

-- Session for completed booking (Marcus at Dev's coworking)
INSERT INTO charging_sessions (
  id, booking_id, ocpp_charge_point_id, charge_point_id, ocpp_connector_id, connector_id,
  status, ocpp_id_tag, ocpp_transaction_id,
  meter_start_wh, meter_stop_wh, peak_power_w, power_w, soc_percent,
  energy_cost_cents, total_session_cost_cents,
  pricing_model, price_per_kwh_cents, price_per_session_cents, idle_fee_per_min_cents,
  authorized_at, started_at, ended_at, duration_minutes, stop_reason,
  created_at, updated_at
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'DEV-NEXUS-001', 'DEV-NEXUS-001', 1, 1,
  'completed',
  'ZG1000000000000000',
  10042,
  1284500, 1310900,  -- register before/after: 26.4 kWh delivered
  7100,     -- 7.1 kW peak
  0,        -- power = 0 (session over)
  92,       -- 92% SoC at end
  824, 824, -- £1.00 session fee + 26.4 kWh × 28p (rounded)
  'hybrid', 28, 100, 12,
  NOW() - INTERVAL '3 days 4 hours',
  NOW() - INTERVAL '3 days 4 hours',
  NOW() - INTERVAL '3 days 1 hour',
  180,
  'Remote',
  NOW() - INTERVAL '3 days 4 hours 5 minutes',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;

-- OCPP meter value snapshots for the completed session (energy = session delta)
INSERT INTO session_meter_values (
  session_id, recorded_at, energy_wh, power_kw, soc_pct, voltage_v, current_a
) VALUES
  ('50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 4 hours',        0,     6.8, 28, 237, 28.7),
  ('50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours 55 min', 5800,  7.1, 39, 238, 29.9),
  ('50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours 40 min', 12300, 7.0, 55, 237, 29.5),
  ('50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours 20 min', 19100, 6.2, 72, 237, 26.2),
  ('50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 3 hours',        24600, 3.8, 86, 236, 16.1),
  ('50000000-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days 1 hour',         26400, 0.0, 92, 230, 0.0);

UPDATE transactions
SET session_id = '50000000-0000-0000-0000-000000000001', energy_kwh_delivered = 26.4
WHERE id = '40000000-0000-0000-0000-000000000002';

COMMIT;
