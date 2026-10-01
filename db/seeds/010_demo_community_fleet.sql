-- ============================================================
-- Zipgrid Demo Seed 010 — Demo Community & Fleet Data
-- ============================================================
-- Populates:
--   - community_posts + replies (AI instant + human + expert)
--   - community_votes
--   - fleet_accounts + fleet_members (corporate demo)
--   - parking_listings (Module N demo data)
--   - user_preferences for all 5 personas
--   - saved_listings (Marcus saved Sarah's charger)
--   - webhook subscriptions (Dev's SMB endpoint)
--
-- Depends on: 003_demo_personas.sql, 004_demo_listings.sql
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- USER PREFERENCES (all 5 personas)
-- ──────────────────────────────────────────────────────────────

-- Marcus: power user — agentic mode, auto-schedule enabled
INSERT INTO user_preferences (
  user_id, preferred_tariff,
  preferred_charge_start_time, preferred_charge_end_time,
  preferred_target_soc_pct, preferred_min_range_km,
  preferred_max_radius_km,
  notify_idle_fee_warning, notify_session_complete,
  notify_booking_reminder, notify_price_spike_alert,
  preferred_voice_mode, voice_confirmation_required,
  ai_auto_schedule_enabled, ai_data_collection_consent,
  updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'octopus_agile',
  '01:30', '06:30',
  85, 80, 5,
  true, true, true, true,
  'agentic', false,
  true, true,
  NOW() - INTERVAL '7 days'
) ON CONFLICT (user_id) DO UPDATE SET
  preferred_tariff              = EXCLUDED.preferred_tariff,
  preferred_charge_start_time   = EXCLUDED.preferred_charge_start_time,
  preferred_target_soc_pct      = EXCLUDED.preferred_target_soc_pct,
  preferred_voice_mode          = EXCLUDED.preferred_voice_mode,
  ai_auto_schedule_enabled      = EXCLUDED.ai_auto_schedule_enabled,
  ai_data_collection_consent    = EXCLUDED.ai_data_collection_consent,
  updated_at                    = EXCLUDED.updated_at;

-- Sarah: hybrid mode, moderate preferences
INSERT INTO user_preferences (
  user_id, preferred_tariff,
  preferred_charge_start_time, preferred_charge_end_time,
  preferred_target_soc_pct, preferred_min_range_km,
  preferred_max_radius_km,
  notify_idle_fee_warning, notify_session_complete,
  preferred_voice_mode, voice_confirmation_required,
  ai_auto_schedule_enabled, ai_data_collection_consent,
  updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'octopus_go',
  '23:30', '07:00',
  80, 60, 3,
  true, true,
  'hybrid', true,
  false, true,
  NOW() - INTERVAL '14 days'
) ON CONFLICT (user_id) DO UPDATE SET
  preferred_tariff            = EXCLUDED.preferred_tariff,
  preferred_voice_mode        = EXCLUDED.preferred_voice_mode,
  ai_data_collection_consent  = EXCLUDED.ai_data_collection_consent,
  updated_at                  = EXCLUDED.updated_at;

-- Dev: standard mode (SMB host, less AI automation)
INSERT INTO user_preferences (
  user_id,
  preferred_target_soc_pct,
  notify_idle_fee_warning, notify_session_complete, notify_booking_reminder,
  preferred_voice_mode, voice_confirmation_required,
  ai_auto_schedule_enabled,
  updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000002',
  80,
  true, true, true,
  'standard', true,
  false,
  NOW() - INTERVAL '30 days'
) ON CONFLICT (user_id) DO UPDATE SET
  preferred_voice_mode  = EXCLUDED.preferred_voice_mode,
  updated_at            = EXCLUDED.updated_at;

-- Andy: new user, defaults mostly
INSERT INTO user_preferences (
  user_id,
  preferred_max_radius_km,
  notify_idle_fee_warning, notify_session_complete,
  preferred_voice_mode,
  updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  10,
  true, true,
  'hybrid',
  NOW() - INTERVAL '8 days'
) ON CONFLICT (user_id) DO UPDATE SET
  updated_at = EXCLUDED.updated_at;


-- ──────────────────────────────────────────────────────────────
-- SAVED LISTINGS
-- ──────────────────────────────────────────────────────────────

-- Marcus saved Sarah's home charger
INSERT INTO saved_listings (user_id, listing_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  NOW() - INTERVAL '45 days'
) ON CONFLICT (user_id, listing_id) DO NOTHING;

-- Marcus saved Dev's coworking charger
INSERT INTO saved_listings (user_id, listing_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '30 days'
) ON CONFLICT (user_id, listing_id) DO NOTHING;

-- Andy saved his nearest charger
INSERT INTO saved_listings (user_id, listing_id, created_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000003',
  NOW() - INTERVAL '6 days'
) ON CONFLICT (user_id, listing_id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- COMMUNITY POSTS
-- ──────────────────────────────────────────────────────────────

-- Post 1: Marcus asks about Octopus Agile tariff (answered by AI + expert)
INSERT INTO community_posts (
  id, author_user_id, type, status,
  title, body,
  tags, region_code,
  view_count, reply_count, upvote_count, is_answered,
  ai_moderation_score,
  created_at, updated_at
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  'question', 'published',
  'Is Octopus Agile worth it for overnight charging?',
  'I have been on a flat rate tariff at 34p/kWh and considering switching to Octopus Agile. My Tesla Model 3 needs roughly 20–25 kWh overnight. Anyone done the maths on whether Agile actually saves money or is the variability stressful?',
  ARRAY['octopus_agile','tariff','overnight_charging','tesla','london'],
  'GB-LND',
  847, 3, 24, true,
  0.998,
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '11 days'
) ON CONFLICT (id) DO NOTHING;

-- Post 2: Andy asks about Chademo availability (newcomer question)
INSERT INTO community_posts (
  id, author_user_id, type, status,
  title, body,
  tags, region_code,
  view_count, reply_count, upvote_count, is_answered,
  ai_moderation_score,
  created_at, updated_at
) VALUES (
  'd0000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000004',
  'question', 'published',
  'Are there many Chademo chargers in Bristol? Worried about my Nissan Leaf',
  'Just got a Nissan Leaf 2022. Someone at work said Chademo is being phased out. Is it still easy enough to find rapid chargers in Bristol? Should I have got a CCS car instead?',
  ARRAY['chademo','nissan_leaf','bristol','rapid_charging','range_anxiety'],
  'GB-SWE',
  312, 2, 18, true,
  0.997,
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '7 days'
) ON CONFLICT (id) DO NOTHING;

-- Post 3: Sarah shares a hosting tip
INSERT INTO community_posts (
  id, author_user_id, type, status,
  title, body,
  tags, region_code,
  view_count, reply_count, upvote_count, is_answered,
  ai_moderation_score,
  created_at, updated_at
) VALUES (
  'd0000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'tip', 'published',
  'Adding a gate code to your listing doubled my bookings',
  'Quick tip for homeowner hosts: I added a detailed gate code + parking instructions with a photo and my bookings went from 2 to 4 per week. Drivers really want to know exactly what to expect before they commit. Little details make a big difference.',
  ARRAY['hosting_tips','access_instructions','bookings','homeowner'],
  'GB-LND',
  1240, 4, 67, false,
  0.999,
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '18 days'
) ON CONFLICT (id) DO NOTHING;

-- Post 4: Emergency help channel post
INSERT INTO community_posts (
  id, author_user_id, type, status,
  title, body,
  tags, region_code,
  view_count, reply_count, upvote_count, is_answered,
  ai_moderation_score,
  is_pinned,
  created_at, updated_at
) VALUES (
  'd0000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000004',
  'emergency_help', 'published',
  'Stranded in Swindon — 6% battery, nearest charger showing offline',
  'Battery at 6%, the Zipgrid charger I booked on Bath Road is showing offline. I am 11 miles from my home charger. What do I do??',
  ARRAY['emergency','swindon','offline_charger','range_anxiety'],
  'GB-SWE',
  89, 2, 5, true,
  0.996,
  false,
  NOW() - INTERVAL '3 days 2 hours',
  NOW() - INTERVAL '3 days 1 hour 55 minutes'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- COMMUNITY REPLIES
-- ──────────────────────────────────────────────────────────────

-- Reply 1a: AI instant reply to Marcus's Octopus Agile question
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body, ai_model_used, ai_confidence,
  upvote_count, is_accepted, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  NULL,
  'ai_instant',
  'Great question! For a Tesla Model 3 needing 20–25 kWh overnight, Octopus Agile typically charges 5–12p/kWh between midnight and 5am, compared to 34p on a flat rate. That''s a saving of roughly £4.50–£7.00 per charge. Over a month of daily charging, that''s £135–£210 back in your pocket. The variability is real — on rare peak days the rate can spike above 30p — but Zipgrid''s AI scheduler automatically books your charge at the cheapest window so you never have to watch the prices yourself.',
  'gpt-4o', 0.934,
  19, true, true,
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '12 days'
) ON CONFLICT (id) DO NOTHING;

-- Reply 1b: Expert reply — tariff adviser
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body, expert_credential,
  upvote_count, is_accepted, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'expert',
  'I switched 14 months ago and have not looked back. The AI scheduling on Zipgrid does the hard work — I just plug in at night and it handles the rest. My average overnight rate last month was 7.8p/kWh. One tip: enable the price spike alert so you get a heads-up on the rare high-rate days.',
  'Verified Energy Tariff Adviser',
  8, false, false,
  NOW() - INTERVAL '11 days 20 hours',
  NOW() - INTERVAL '11 days 20 hours'
) ON CONFLICT (id) DO NOTHING;

-- Reply 2a: AI instant reply to Andy's Chademo question
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body, ai_model_used, ai_confidence,
  upvote_count, is_accepted, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000002',
  NULL,
  'ai_instant',
  'Your Nissan Leaf is in good company in Bristol — there are currently 23 Chademo rapid chargers within 10 miles of Bristol city centre, including 6 on Zipgrid. While the industry is gradually moving to CCS, Chademo will remain well-supported in the UK for at least 5–7 more years, and your 2022 Leaf also has a Type 2 AC port for the vast majority of home and destination chargers. For everyday charging you will almost certainly use the Type 2 connection — Chademo is mainly for rapid top-ups on longer journeys.',
  'gpt-4o', 0.911,
  14, true, true,
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '8 days'
) ON CONFLICT (id) DO NOTHING;

-- Reply 2b: Human community reply
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body,
  upvote_count, is_accepted, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000004',
  'd0000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  'human',
  'I had the same worry when I was looking at EVs. Ended up getting the CCS option but honestly if I was buying today and the Leaf ticked all the other boxes I would not let Chademo put me off. Bristol has solid coverage.',
  4, false, false,
  NOW() - INTERVAL '7 days 18 hours',
  NOW() - INTERVAL '7 days 18 hours'
) ON CONFLICT (id) DO NOTHING;

-- Reply 3a: Sarah's hosting tip — AI adds context
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body, ai_model_used, ai_confidence,
  upvote_count, is_accepted, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000005',
  'd0000000-0000-0000-0000-000000000003',
  NULL,
  'ai_instant',
  'Sarah is spot on. Listings with detailed access instructions and at least one photo get 2.4× more bookings on average. Other high-impact additions: mentioning whether there is parking alongside the charger, whether it is covered, and your typical response time to messages. All of these increase driver confidence and convert browsing into confirmed bookings.',
  'gpt-4o', 0.924,
  38, false, true,
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '20 days'
) ON CONFLICT (id) DO NOTHING;

-- Reply 4a: Emergency help — AI immediate response
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body, ai_model_used, ai_confidence,
  upvote_count, is_accepted, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000006',
  'd0000000-0000-0000-0000-000000000004',
  NULL,
  'ai_instant',
  'Activating Emergency Mode now. I can see 2 Zipgrid hosts within 1.2 miles of your location — alerting them immediately. Meanwhile: the nearest public rapid charger is Swindon Designer Outlet (0.6 miles, 50 kW CCS/Chademo, showing available). Your battery at 6% gives you roughly 9–11 miles of range on a Leaf — you can reach it. Go to the map screen and tap "Emergency" for turn-by-turn directions. I''m holding this post open until you confirm you''re safe.',
  'gpt-4o', 0.967,
  5, true, false,
  NOW() - INTERVAL '3 days 2 hours',
  NOW() - INTERVAL '3 days 2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Reply 4b: Community reassurance
INSERT INTO community_replies (
  id, post_id, author_user_id, type,
  body,
  upvote_count, is_verified,
  created_at, updated_at
) VALUES (
  'e0000000-0000-0000-0000-000000000007',
  'd0000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'human',
  'Hope you are okay! The emergency feature on the app should connect you with nearby hosts too. Swindon has a few public ones around the retail park — you will be fine at 6%, just go slow and steady.',
  2, false,
  NOW() - INTERVAL '3 days 1 hour 55 minutes',
  NOW() - INTERVAL '3 days 1 hour 55 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Update post reply_count and is_answered
UPDATE community_posts SET reply_count = 2, is_answered = true  WHERE id = 'd0000000-0000-0000-0000-000000000001';
UPDATE community_posts SET reply_count = 2, is_answered = true  WHERE id = 'd0000000-0000-0000-0000-000000000002';
UPDATE community_posts SET reply_count = 1, is_answered = false WHERE id = 'd0000000-0000-0000-0000-000000000003';
UPDATE community_posts SET reply_count = 2, is_answered = true  WHERE id = 'd0000000-0000-0000-0000-000000000004';


-- ──────────────────────────────────────────────────────────────
-- COMMUNITY VOTES
-- ──────────────────────────────────────────────────────────────

-- Marcus voted on Sarah's hosting tip post
INSERT INTO community_votes (user_id, post_id, created_at)
VALUES ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '19 days')
ON CONFLICT DO NOTHING;

-- Andy voted on Marcus's Octopus Agile post
INSERT INTO community_votes (user_id, post_id, created_at)
VALUES ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '7 days')
ON CONFLICT DO NOTHING;

-- Marcus voted on the AI reply to Andy's question
INSERT INTO community_votes (user_id, reply_id, created_at)
VALUES ('10000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '7 days')
ON CONFLICT DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- FLEET ACCOUNTS & MEMBERS (corporate demo)
-- Company: GreenMove Logistics — 8 drivers, Dev as fleet admin
-- ──────────────────────────────────────────────────────────────

INSERT INTO fleet_accounts (
  id, company_name, company_registration, vat_number,
  max_spend_per_session_pence, max_spend_per_month_pence,
  requires_approval,
  invoice_status, billing_email,
  stripe_subscription_id,
  admin_user_id,
  created_at, updated_at
) VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'GreenMove Logistics Ltd',
  '14821047',
  'GB381920471',
  3000,         -- £30 per session max
  50000,        -- £500 per month per driver max
  false,
  'current',
  'accounts@greenmove.co.uk',
  'sub_greenmove_fleet_001',
  '10000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;

-- Dev is fleet admin
INSERT INTO fleet_members (
  id, fleet_account_id, user_id,
  role, status, invited_at, accepted_at,
  created_at, updated_at
) VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'fleet_admin', 'active',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '45 days',
  NOW() - INTERVAL '45 days'
) ON CONFLICT (id) DO NOTHING;

-- Marcus is a fleet driver (dual: personal + fleet account)
INSERT INTO fleet_members (
  id, fleet_account_id, user_id,
  role, status, invited_by_user_id, invited_at, accepted_at,
  created_at, updated_at
) VALUES (
  'f1000000-0000-0000-0000-000000000002',
  'f0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  'driver', 'active',
  '10000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '44 days',
  NOW() - INTERVAL '43 days',
  NOW() - INTERVAL '44 days',
  NOW() - INTERVAL '43 days'
) ON CONFLICT (id) DO NOTHING;

-- Andy is a fleet driver (invited, recently accepted)
INSERT INTO fleet_members (
  id, fleet_account_id, user_id,
  role, status, invited_by_user_id, invited_at, accepted_at,
  created_at, updated_at
) VALUES (
  'f1000000-0000-0000-0000-000000000003',
  'f0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000004',
  'driver', 'active',
  '10000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '7 days'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- PARKING LISTINGS (Module N — non-charging P2P parking)
-- Dev lists a parking bay at Nexus Coworking
-- ──────────────────────────────────────────────────────────────

INSERT INTO parking_listings (
  id, host_profile_id,
  address_line1, city, postcode,
  latitude, longitude, location,
  title, description,
  price_pence, price_unit, min_duration_minutes, max_duration_hours,
  available_from, available_to,
  is_ev_dedicated, has_cctv, is_covered, is_disabled_access,
  status, booking_count,
  created_at, updated_at
) VALUES (
  'p0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-1000-000000000002',
  '47 Lever Street',
  'Manchester',
  'M1 1FN',
  53.4808, -2.2374,
  ST_SetSRID(ST_MakePoint(-2.2374, 53.4808), 4326)::geography,
  'Nexus Coworking — Secure EV Bay (no charger)',
  'Dedicated EV parking bay at Nexus Coworking. CCTV monitored, covered car park. Ideal for those who just need a space while they work — charger bays also available separately.',
  150,         -- £1.50/hour
  'per_hour',
  60, 10,
  '07:00', '21:00',
  true, true, true, false,
  'published', 14,
  NOW() - INTERVAL '40 days',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- WEBHOOK SUBSCRIPTIONS (Dev's SMB integration endpoint)
-- ──────────────────────────────────────────────────────────────

INSERT INTO webhook_subscriptions (
  id, user_id,
  url, secret,
  events,
  is_active, last_delivery_at, failure_count,
  created_at, updated_at
) VALUES (
  'w0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'https://api.nexus-coworking.co.uk/zipgrid/webhooks',
  'whs_nexus_demo_secret_abc123def456',
  ARRAY['session.started','session.completed','booking.confirmed','booking.cancelled','payout.paid']::webhook_event_type[],
  true,
  NOW() - INTERVAL '3 days 1 hour',
  0,
  NOW() - INTERVAL '44 days',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;

-- API tenant (Dev's white-label trial — Nexus Coworking branded portal)
INSERT INTO api_tenants (
  id, tenant_name, slug, status,
  api_key_hash, api_key_prefix,
  brand_name, brand_primary_colour,
  stripe_customer_id,
  plan_name, rate_limit_per_minute, rate_limit_per_day,
  admin_email, admin_user_id,
  trial_ends_at,
  created_at, updated_at
) VALUES (
  'q0000000-0000-0000-0000-000000000001',
  'Nexus Coworking Manchester',
  'nexus-coworking',
  'trial',
  '$2b$12$demoHashForNexusCoworkingApiKeyNotARealBcryptHash1234567',
  'zg_test_nexus',
  'Nexus EV',
  '#1A56DB',
  'cus_dev_demo_002',
  'starter',
  60, 5000,
  'dev.patel@demo.zipgrid.co.uk',
  '10000000-0000-0000-0000-000000000002',
  NOW() + INTERVAL '15 days',
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- BLOG THREAD (links community to blog article)
-- ──────────────────────────────────────────────────────────────

INSERT INTO blog_post_threads (
  id, article_slug, title, is_open, reply_count,
  created_at, updated_at
) VALUES (
  'bt000000-0000-0000-0000-000000000001',
  'octopus-agile-vs-go-for-ev-drivers-2026',
  'Octopus Agile vs Go for EV drivers in 2026 — which saves more?',
  true, 12,
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '2 days'
) ON CONFLICT (article_slug) DO NOTHING;

INSERT INTO blog_post_threads (
  id, article_slug, title, is_open, reply_count,
  created_at, updated_at
) VALUES (
  'bt000000-0000-0000-0000-000000000002',
  'how-to-become-a-zipgrid-host-2026',
  'How to become a Zipgrid host in 2026 — the complete guide',
  true, 7,
  NOW() - INTERVAL '21 days',
  NOW() - INTERVAL '5 days'
) ON CONFLICT (article_slug) DO NOTHING;

COMMIT;
