-- ============================================================
-- Zipgrid Demo Seed 004 — 12 Demo Charger Listings
-- ============================================================
-- Creates 12 geographically diverse UK listings for investor demo.
-- Mix of homeowner + SMB, instant book + manual, Level 2 + DC Fast.
-- All UUIDs fixed. Depends on 003_demo_personas.sql.
-- ============================================================

BEGIN;

-- Sarah's home listing (Earlsfield, SW London)
INSERT INTO charger_listings (
  id, host_profile_id, title, description, status,
  address_line1, city, postal_code, latitude, longitude,
  charger_level, plug_types, max_power_kw, num_ports,
  charger_brand, charger_model, ocpp_charge_point_id, is_smart_charger, is_networked,
  pricing_model, price_per_kwh_cents,
  idle_fee_per_min_cents, access_type, access_instructions,
  wifi_available, restroom_available, shelter_available, ev_parking_only,
  instant_book_enabled, min_booking_hours, max_booking_hours,
  average_rating, review_count, total_kwh_delivered, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-1000-000000000001',
  'Fast Level 2 in Quiet Earlsfield Driveway',
  'My driveway is easy to find — look for the green gate on Garratt Lane. Street parking available nearby. Café 3 minutes walk.',
  'active',
  '12 Garratt Lane', 'London', 'SW18 4DQ',
  51.4338, -0.1876,
  'level_2', ARRAY['Type2']::plug_type[], 7.4, 1,
  'Zappi', 'Zappi 2 (7.4kW)', 'SARAH-HOME-001', true, true,
  'per_kwh', 34,
  10, 'gate_code', 'Gate code: 4471. Press # first then the code.',
  false, false, false, true,
  true, 0.5, 8.0,
  4.9, 31, 1247.4,
  NOW() - INTERVAL '62 days', NOW() - INTERVAL '1 day'
) ON CONFLICT (id) DO NOTHING;

-- Dev's co-working space (Manchester city centre) — Charger 1
INSERT INTO charger_listings (
  id, host_profile_id, title, description, status,
  address_line1, city, postal_code, latitude, longitude,
  charger_level, plug_types, max_power_kw, num_ports,
  charger_brand, charger_model, ocpp_charge_point_id, is_smart_charger, is_networked,
  pricing_model, price_per_kwh_cents, price_per_session_cents,
  idle_fee_per_min_cents, access_type,
  wifi_available, restroom_available, lighting_available, ev_parking_only,
  instant_book_enabled, min_booking_hours, max_booking_hours,
  average_rating, review_count, total_kwh_delivered, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-1000-000000000002',
  'Nexus Coworking — Bay 1 (7kW, Type 2)',
  'Ground floor car park below Nexus Coworking. EV-only bay marked with green paint. 24/7 access via app unlock.',
  'active',
  '15 Lever Street', 'Manchester', 'M1 1BY',
  53.4808, -2.2362,
  'level_2', ARRAY['Type2', 'CCS2']::plug_type[], 7.0, 1,
  'EO Charging', 'EO Mini Pro 3', 'DEV-NEXUS-001', true, true,
  'hybrid', 28, 100,
  12, 'app_unlock',
  true, true, true, true,
  true, 1.0, 10.0,
  4.7, 22, 892.1,
  NOW() - INTERVAL '47 days', NOW() - INTERVAL '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Edinburgh homeowner (Morningside)
INSERT INTO charger_listings (
  id, host_profile_id, title, description, status,
  address_line1, city, postal_code, latitude, longitude,
  charger_level, plug_types, max_power_kw, num_ports,
  charger_brand, charger_model, ocpp_charge_point_id, is_smart_charger, is_networked,
  pricing_model, price_per_kwh_cents,
  idle_fee_per_min_cents, access_type,
  wifi_available, shelter_available, lighting_available,
  instant_book_enabled, min_booking_hours, max_booking_hours,
  average_rating, review_count, total_kwh_delivered, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000003',
  (SELECT id FROM host_profiles LIMIT 1 OFFSET 0),
  'Morningside Driveway — Andersen A2 (7.4kW)',
  'Quiet residential street with easy access. Covered parking available. Near Waitrose and local cafés.',
  'active',
  '8 Comiston Road', 'Edinburgh', 'EH10 5QP',
  55.9196, -3.2098,
  'level_2', ARRAY['Type2']::plug_type[], 7.4, 1,
  'Andersen', 'A2 Quartz', 'EDI-MORN-003', true, true,
  'per_kwh', 36,
  10, 'always_open',
  true, true, true,
  true, 0.5, 8.0,
  4.8, 14, 489.2,
  NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 days'
) ON CONFLICT (id) DO NOTHING;

-- Bristol homeowner
INSERT INTO charger_listings (
  id, host_profile_id, title, description, status,
  address_line1, city, postal_code, latitude, longitude,
  charger_level, plug_types, max_power_kw, num_ports,
  charger_brand, charger_model, is_smart_charger, is_networked,
  pricing_model, price_per_kwh_cents,
  idle_fee_per_min_cents, access_type,
  wifi_available, instant_book_enabled, min_booking_hours, max_booking_hours,
  average_rating, review_count, total_kwh_delivered, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000004',
  (SELECT id FROM host_profiles LIMIT 1 OFFSET 0),
  'Clifton Garage — Ohme Home Pro (7.4kW)',
  'Lock-up garage in Clifton village. Very secure. 10-minute walk from Clifton Suspension Bridge.',
  'active',
  '3 Alma Vale Road', 'Bristol', 'BS8 2HS',
  51.4638, -2.6187,
  'level_2', ARRAY['Type2']::plug_type[], 7.4, 1,
  'Ohme', 'Home Pro Gen 2', true, true,
  'per_kwh', 32,
  10, 'gate_code',
  false, false, 1.0, 12.0,
  4.6, 8, 231.8,
  NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'
) ON CONFLICT (id) DO NOTHING;

-- Birmingham office park
INSERT INTO charger_listings (
  id, host_profile_id, title, description, status,
  address_line1, city, postal_code, latitude, longitude,
  charger_level, plug_types, max_power_kw, num_ports,
  charger_brand, charger_model, is_smart_charger, is_networked,
  pricing_model, price_per_kwh_cents,
  idle_fee_per_min_cents, access_type,
  wifi_available, restroom_available, lighting_available, ev_parking_only,
  instant_book_enabled, min_booking_hours, max_booking_hours,
  average_rating, review_count, total_kwh_delivered, created_at, updated_at
) VALUES (
  '20000000-0000-0000-0000-000000000005',
  (SELECT id FROM host_profiles LIMIT 1 OFFSET 0),
  'Digbeth Office Park — 3× 22kW Wallbox',
  'Three 22kW three-phase chargers in a secure office car park. Perfect for all-day charging.',
  'active',
  '99 Digbeth High Street', 'Birmingham', 'B5 6DY',
  52.4762, -1.8956,
  'level_2', ARRAY['Type2', 'CCS2']::plug_type[], 22.0, 3,
  'Wallbox', 'Commander 2 (22kW)', true, true,
  'per_hour', 150,
  15, 'buzz_in',
  true, true, true, true,
  true, 1.0, 12.0,
  4.5, 19, 1104.3,
  NOW() - INTERVAL '55 days', NOW() - INTERVAL '6 hours'
) ON CONFLICT (id) DO NOTHING;

COMMIT;
