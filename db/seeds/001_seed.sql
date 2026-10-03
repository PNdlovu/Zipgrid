-- ============================================================
-- Zipgrid Seed Data
-- ============================================================
-- Realistic development/staging dataset covering:
--   - 3 users (1 admin, 1 dual host+driver, 1 driver-only)
--   - 2 vehicles
--   - 3 charger listings across different cities/levels
--   - Availability schedules & a blackout date
--   - 1 confirmed booking → charging session → transaction
--   - 1 published review
--   - Sample notifications
-- All UUIDs are fixed so foreign keys resolve without lookup.
-- ============================================================

BEGIN;

-- ============================================================
-- USERS
-- ============================================================

INSERT INTO users (
    id, email, full_name, phone,
    roles, account_status, kyc_status, kyc_verified_at,
    email_verified_at,
    stripe_customer_id, stripe_connect_account_id
) VALUES
-- Admin user
(
    '00000000-0000-0000-0000-000000000001',
    'admin@zipgrid.io',
    'Zipgrid Admin',
    '+12025550100',
    '{admin}',
    'active', 'verified', NOW(),
    NOW(),
    NULL, NULL
),
-- Host + Driver (dual role) — residential homeowner
(
    '00000000-0000-0000-0000-000000000002',
    'sarah.chen@example.com',
    'Sarah Chen',
    '+14155550102',
    '{host, driver}',
    'active', 'verified', NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '31 days',
    'cus_test_sarah001', 'acct_test_sarah001'
),
-- Driver only — urban EV commuter
(
    '00000000-0000-0000-0000-000000000003',
    'marcus.johnson@example.com',
    'Marcus Johnson',
    '+13105550103',
    '{driver}',
    'active', 'verified', NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '15 days',
    'cus_test_marcus001', NULL
);


-- ============================================================
-- DRIVER PROFILES
-- ============================================================

INSERT INTO driver_profiles (
    id, user_id,
    preferred_plug_types, preferred_min_kw,
    total_sessions, total_kwh_consumed, total_spend_cents,
    is_trusted
) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',   -- Sarah (dual role)
    '{J1772, CCS1}', 7,
    12, 98.40, 3200,
    TRUE
),
(
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',   -- Marcus
    '{CCS1, NACS}', 11,
    4, 42.10, 1350,
    FALSE
);


-- ============================================================
-- DRIVER VEHICLES
-- ============================================================

INSERT INTO driver_vehicles (
    id, driver_profile_id,
    make, model, year, color,
    license_plate, license_plate_state,
    plug_types, battery_capacity_kwh,
    is_primary, is_active
) VALUES
-- Sarah's Chevy Bolt
(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Chevrolet', 'Bolt EV', 2022, 'Radiant Red',
    '7EVC423', 'CA',
    '{CCS1, J1772}', 65.00,
    TRUE, TRUE
),
-- Marcus's Tesla Model 3
(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Tesla', 'Model 3', 2023, 'Pearl White',
    'EVMJ2024', 'CA',
    '{NACS, CCS1}', 82.00,
    TRUE, TRUE
);


-- ============================================================
-- HOST PROFILES
-- ============================================================

INSERT INTO host_profiles (
    id, user_id,
    host_type, business_name,
    payout_enabled, payout_schedule,
    platform_tier, commission_rate_pct,
    total_listings, is_superhost, identity_verified
) VALUES
(
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',   -- Sarah
    'residential', NULL,
    TRUE, 'weekly',
    'starter', 15.00,
    2, FALSE, TRUE
);


-- ============================================================
-- CHARGER LISTINGS
-- Locations: San Francisco CA, Austin TX, Chicago IL
-- location geometry auto-synced by sync_listing_location()
-- trigger when latitude/longitude are set.
-- ============================================================

INSERT INTO charger_listings (
    id, host_profile_id,
    title, description, status,
    latitude, longitude,
    address_line1, city, state_province, postal_code, country_code,
    charger_level, plug_types, max_power_kw,
    voltage, amperage, num_ports,
    charger_brand, charger_model,
    ocpp_charge_point_id, is_smart_charger, is_networked,
    pricing_model,
    price_per_kwh_cents, idle_fee_per_min_cents,
    peak_surcharge_pct, peak_hours_start, peak_hours_end,
    access_type, access_instructions,
    wifi_available, restroom_available, shelter_available,
    lighting_available, wheelchair_accessible,
    amenity_tags, photo_urls,
    instant_book_enabled, min_booking_hours, max_booking_hours,
    advance_booking_days, buffer_minutes,
    total_bookings, total_kwh_delivered, average_rating, review_count
) VALUES
-- Listing 1: San Francisco residential Level 2
(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Quiet Noe Valley Driveway — Level 2 (48A)',
    'Clean, covered parking in a private driveway. My ChargePoint Flex is set to 48A / 11.5kW. Gate code sent automatically on booking. Nearby Whole Foods and great coffee shops.',
    'active',
    37.7510, -122.4330,
    '142 Sanchez St', 'San Francisco', 'CA', '94114', 'US',
    'level_2', '{J1772, CCS1}', 11.5,
    240, 48, 1,
    'ChargePoint', 'CPF32',
    'ZIPGRID-SF-001', TRUE, TRUE,
    'per_kwh',
    32, 10,
    20.00, '17:00', '21:00',
    'gate_code', 'Gate code: #2847. Pull in left side of driveway.',
    TRUE, FALSE, TRUE,
    TRUE, TRUE,
    '{coffee_shop_nearby, grocery_nearby, quiet_residential}',
    '{https://cdn.zipgrid.io/listings/sf001/cover.jpg, https://cdn.zipgrid.io/listings/sf001/charger.jpg}',
    TRUE, 0.5, 8.0,
    14, 15,
    23, 187.50, 4.91, 21
),
-- Listing 2: Austin TX commercial restaurant (Level 2)
(
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'Charge While You Dine — Rainey St Restaurant Lot',
    'Two Level 2 spots in our restaurant parking lot. Free charging for diners ordering $25+, paid charging for everyone else. Open until 11 PM on weekends.',
    'active',
    30.2588, -97.7351,
    '85 Rainey St', 'Austin', 'TX', '78701', 'US',
    'level_2', '{J1772}', 7.2,
    240, 30, 2,
    'JuiceBox', 'JuiceBox 40',
    'ZIPGRID-ATX-001', TRUE, TRUE,
    'per_hour',
    250, 15,
    0.00, NULL, NULL,
    'always_open', 'Park in spots marked EV CHARGING on the east side of the lot.',
    TRUE, TRUE, FALSE,
    TRUE, FALSE,
    '{restaurant_onsite, bar_nearby, live_music, valet_available}',
    '{https://cdn.zipgrid.io/listings/atx001/cover.jpg}',
    TRUE, 0.5, 4.0,
    7, 10,
    8, 52.80, 4.75, 7
),
-- Listing 3: Chicago IL residential NEMA 14-50 (Level 2 slow)
(
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'Logan Square Garage — NEMA 14-50 Outlet',
    'Standard 240V 50A outlet in a secure shared garage. Bring your own J1772 adapter. Best for overnight charging. Access via app-controlled garage door.',
    'active',
    41.9217, -87.7076,
    '2214 N Milwaukee Ave', 'Chicago', 'IL', '60647', 'US',
    'level_2', '{NEMA_14_50}', 9.6,
    240, 40, 1,
    NULL, NULL,
    NULL, FALSE, FALSE,
    'per_session',
    NULL, 5,
    0.00, NULL, NULL,
    'app_unlock', 'Tap "Unlock Garage" in the app when you arrive. Bay #3.',
    FALSE, FALSE, TRUE,
    TRUE, FALSE,
    '{secure_garage, overnight_ok, quiet_neighborhood}',
    '{https://cdn.zipgrid.io/listings/chi001/cover.jpg}',
    FALSE, 4.0, 12.0,
    7, 30,
    3, 28.80, 4.67, 3
);

-- Note: the sync_listing_location() trigger fires on INSERT,
-- auto-populating the GEOGRAPHY column from lat/lng above.


-- ============================================================
-- AVAILABILITY SCHEDULES
-- SF listing: available Mon–Fri 8am–6pm (host at work)
-- Austin listing: available every day 11am–11pm
-- ============================================================

INSERT INTO listing_availability_schedules (
    listing_id, day_of_week, open_time, close_time, is_available
)
SELECT
    '40000000-0000-0000-0000-000000000001',
    d::day_of_week,
    '08:00', '18:00',
    TRUE
FROM unnest(ARRAY['monday','tuesday','wednesday','thursday','friday']::day_of_week[]) AS d;

INSERT INTO listing_availability_schedules (
    listing_id, day_of_week, open_time, close_time, is_available
)
SELECT
    '40000000-0000-0000-0000-000000000002',
    d::day_of_week,
    '11:00', '23:00',
    TRUE
FROM unnest(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::day_of_week[]) AS d;


-- ============================================================
-- BLACKOUT DATE: SF listing closed next holiday
-- ============================================================

INSERT INTO listing_blackout_dates (listing_id, blackout_date, reason)
VALUES (
    '40000000-0000-0000-0000-000000000001',
    '2026-11-26',   -- Thanksgiving
    'Family Thanksgiving — driveway in use all day.'
);


-- ============================================================
-- BOOKING
-- Marcus books the SF listing for a 2-hour session
-- ============================================================

INSERT INTO bookings (
    id,
    listing_id, driver_profile_id, vehicle_id,
    scheduled_start, scheduled_end,
    status,
    pricing_model,
    quoted_price_per_kwh_cents, quoted_idle_fee_per_min_cents,
    peak_surcharge_pct,
    estimated_cost_cents,
    access_type, access_instructions,
    instant_book, host_approved_at,
    driver_arrival_code,
    confirmed_at, completed_at
) VALUES (
    '50000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',   -- Marcus driving
    '20000000-0000-0000-0000-000000000002',   -- Tesla Model 3
    '2026-09-24 10:00:00+00',
    '2026-09-24 12:00:00+00',
    'completed',
    'per_kwh',
    32, 10,
    0.00,
    768,    -- estimated: ~24kWh × $0.32 = $7.68
    'gate_code', 'Gate code: #2847. Pull in left side of driveway.',
    TRUE, '2026-09-23 18:45:00+00',
    'ZG8472',
    '2026-09-23 18:45:00+00',
    '2026-09-24 12:08:00+00'
);


-- ============================================================
-- CHARGING SESSION (OCPP)
-- ============================================================

INSERT INTO charging_sessions (
    id, booking_id,
    ocpp_transaction_id, ocpp_charge_point_id, ocpp_connector_id,
    status,
    authorized_at, started_at, ended_at,
    meter_start_wh, meter_stop_wh,
    peak_power_kw, stop_reason,
    idle_started_at, idle_minutes,
    energy_cost_cents, idle_fee_cents,
    peak_surcharge_cents, total_session_cost_cents
) VALUES (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    10042, 'ZIPGRID-SF-001', 1,
    'completed',
    '2026-09-24 10:00:32+00',
    '2026-09-24 10:01:15+00',
    '2026-09-24 12:07:48+00',
    45820000,    -- meter start in Wh (45,820 kWh on the odometer)
    46043200,    -- meter stop  in Wh (delivered 23.2 kWh this session)
    11.4, 'EVDisconnected',
    '2026-09-24 12:02:10+00', 5,  -- 5 idle minutes
    742,   -- 23.2 kWh × $0.32 = $7.42
    50,    -- 5 idle minutes × $0.10 = $0.50
    0,
    792    -- total: $7.92
);

-- Sample meter value snapshots (every ~30 min)
INSERT INTO session_meter_values
    (session_id, recorded_at, energy_wh, power_kw, current_a, voltage_v, soc_pct)
VALUES
    ('60000000-0000-0000-0000-000000000001', '2026-09-24 10:01:15+00', 45820000, 11.4, 47.5, 240.2, 41),
    ('60000000-0000-0000-0000-000000000001', '2026-09-24 10:31:00+00', 45925700, 11.3, 47.1, 240.1, 58),
    ('60000000-0000-0000-0000-000000000001', '2026-09-24 11:01:00+00', 46031400, 11.1, 46.3, 240.0, 74),
    ('60000000-0000-0000-0000-000000000001', '2026-09-24 11:31:00+00', 46042100,  4.2, 17.5, 240.0, 89),
    ('60000000-0000-0000-0000-000000000001', '2026-09-24 12:02:10+00', 46043200,  0.0,  0.0, 240.0, 91);


-- ============================================================
-- TRANSACTION
-- ============================================================

INSERT INTO transactions (
    id, booking_id, session_id,
    stripe_payment_intent_id,
    status,
    energy_cost_cents, idle_fee_cents, peak_surcharge_cents,
    subtotal_cents, platform_fee_cents, tax_cents, total_charged_cents,
    host_earnings_cents,
    currency, commission_rate_pct,
    energy_kwh_delivered,
    hold_placed_at, captured_at
) VALUES (
    '70000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'pi_test_3PkLmN2eZvKYlo2C0q8G7x',
    'captured',
    742, 50, 0,
    792,                    -- subtotal
    119,                    -- platform fee: 15% of $7.92 = $1.19
    0,                      -- tax (varies by jurisdiction — 0 for seed)
    792,                    -- total charged to Marcus
    673,                    -- host net: $7.92 - $1.19 = $6.73
    'USD', 15.00,
    23.200,
    '2026-09-23 18:45:05+00',
    '2026-09-24 12:10:00+00'
);


-- ============================================================
-- REVIEW (Marcus reviews the SF listing)
-- ============================================================

INSERT INTO reviews (
    id, booking_id,
    reviewer_user_id, listing_id,
    subject,
    overall_rating,
    rating_accuracy, rating_reliability, rating_location,
    rating_value, rating_communication,
    comment, status, revealed_at
) VALUES (
    '80000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',   -- Marcus
    '40000000-0000-0000-0000-000000000001',   -- SF listing
    'listing',
    5,
    5, 5, 5, 5, 5,
    'Perfect spot. Gate code worked first try, charger fired up instantly. Loved that it''s covered — was raining when I arrived. 23 kWh in just over 2 hours at 11+ kW. Will book again.',
    'published',
    '2026-09-24 14:00:00+00'
);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================

INSERT INTO notifications (
    id, user_id,
    channel, type,
    title, body,
    action_url,
    delivery_status, delivered_at,
    related_booking_id
) VALUES
-- Booking confirmed → Marcus
(
    '90000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'push', 'booking_confirmed',
    'Booking Confirmed ⚡',
    'Your session at Noe Valley on Sep 24, 10:00 AM is confirmed. Check-in code: ZG8472.',
    '/bookings/50000000-0000-0000-0000-000000000001',
    'delivered', '2026-09-23 18:45:10+00',
    '50000000-0000-0000-0000-000000000001'
),
-- 15-min reminder → Marcus
(
    '90000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    'push', 'booking_reminder_15m',
    'Session starts in 15 minutes ⏱',
    'Head to 142 Sanchez St. Gate code: #2847.',
    '/bookings/50000000-0000-0000-0000-000000000001',
    'delivered', '2026-09-24 09:45:05+00',
    '50000000-0000-0000-0000-000000000001'
),
-- Session completed → Marcus
(
    '90000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    'push', 'session_completed',
    'Charging Complete — 23.2 kWh added 🔋',
    'Total charged: $7.92. You gained approx. 92 miles of range.',
    '/sessions/60000000-0000-0000-0000-000000000001',
    'delivered', '2026-09-24 12:08:10+00',
    '50000000-0000-0000-0000-000000000001'
),
-- Idle fee warning → Marcus
(
    '90000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003',
    'push', 'idle_fee_warning',
    'Your car is done charging — move soon!',
    'Your Tesla is fully charged. Idle fees of $0.10/min start in 15 minutes.',
    '/sessions/60000000-0000-0000-0000-000000000001',
    'delivered', '2026-09-24 11:47:10+00',
    '50000000-0000-0000-0000-000000000001'
),
-- New booking request → Sarah (host)
(
    '90000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000002',
    'email', 'booking_auto_approved',
    'New Booking at Noe Valley — $7.92 earned',
    'Marcus Johnson booked your Noe Valley driveway for Sep 24, 10 AM–12 PM. Instant book approved. You''ll earn $6.73 after platform fee.',
    '/host/bookings/50000000-0000-0000-0000-000000000001',
    'delivered', '2026-09-23 18:45:12+00',
    '50000000-0000-0000-0000-000000000001'
),
-- Review received → Sarah
(
    '90000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000002',
    'in_app', 'review_received',
    'Marcus left you a 5-star review ⭐⭐⭐⭐⭐',
    '"Perfect spot. Gate code worked first try..." — tap to read the full review.',
    '/host/reviews/80000000-0000-0000-0000-000000000001',
    'delivered', '2026-09-24 14:00:05+00',
    '50000000-0000-0000-0000-000000000001'
);


-- ============================================================
-- AUDIT LOG ENTRIES
-- ============================================================

INSERT INTO audit_log (
    actor_user_id, action, entity_type, entity_id, new_values
) VALUES
(
    '00000000-0000-0000-0000-000000000003',
    'booking_created',
    'booking',
    '50000000-0000-0000-0000-000000000001',
    '{"listing_id": "40000000-0000-0000-0000-000000000001", "estimated_cost_cents": 768}'
),
(
    '00000000-0000-0000-0000-000000000003',
    'booking_confirmed',
    'booking',
    '50000000-0000-0000-0000-000000000001',
    '{"status": "confirmed", "stripe_payment_intent_id": "pi_test_3PkLmN2eZvKYlo2C0q8G7x"}'
),
(
    '00000000-0000-0000-0000-000000000003',
    'session_started',
    'charging_session',
    '60000000-0000-0000-0000-000000000001',
    '{"ocpp_transaction_id": 10042, "meter_start_wh": 45820000}'
),
(
    '00000000-0000-0000-0000-000000000003',
    'session_completed',
    'charging_session',
    '60000000-0000-0000-0000-000000000001',
    '{"meter_stop_wh": 46043200, "energy_kwh": 23.2, "total_cost_cents": 792}'
),
(
    '00000000-0000-0000-0000-000000000003',
    'payment_captured',
    'transaction',
    '70000000-0000-0000-0000-000000000001',
    '{"total_charged_cents": 792, "host_earnings_cents": 673}'
),
(
    '00000000-0000-0000-0000-000000000003',
    'review_published',
    'review',
    '80000000-0000-0000-0000-000000000001',
    '{"overall_rating": 5, "listing_id": "40000000-0000-0000-0000-000000000001"}'
);

COMMIT;
