-- ============================================================
-- Zipgrid Demo Seed 009 — Demo AI Agent Sessions & Voice Commands
-- ============================================================
-- Populates ai_sessions, agent_tasks, voice_commands, and
-- grid_schedules for the investor demo "AI in action" narrative.
--
-- Demo flows covered:
--   1. Marcus: voice-booked a charger ("Hey Zipgrid, find me a charger")
--   2. Marcus: AI auto-scheduled off-peak smart charge (agentic mode)
--   3. Dev's charger: fault diagnosed by AI → host notified
--   4. Sarah: AI suggested price optimisation based on utilisation
--   5. Andy: voice command with Whisper fallback (STT demo)
--
-- Depends on: 003_demo_personas.sql, 005_demo_bookings.sql,
--             006_demo_sessions.sql
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- AI SESSIONS (conversation memory)
-- ──────────────────────────────────────────────────────────────

-- Marcus: full voice + agentic booking session
INSERT INTO ai_sessions (
  id, user_id,
  messages, ai_mode,
  turn_count, tool_call_count,
  started_at, last_active_at, ended_at,
  extracted_prefs,
  created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '[
    {"role":"human","content":"Hey Zipgrid, find me a charger near Manchester Piccadilly with Type 2, available tomorrow morning","ts":"2026-09-27T08:12:04Z"},
    {"role":"ai","content":"Found 3 chargers within 0.8 miles of Manchester Piccadilly. Nexus Coworking on Lever Street has a 7.4 kW Type 2 available 08:00–18:00, currently priced at 28p/kWh. Want me to book it for you at 09:00?","ts":"2026-09-27T08:12:06Z"},
    {"role":"human","content":"Yes, book it for 3 hours","ts":"2026-09-27T08:12:18Z"},
    {"role":"ai","content":"Done! Booking confirmed at Nexus Coworking, 09:00–12:00 tomorrow. Estimated cost £8.24. I''ve added it to your calendar. Access code will arrive 30 minutes before arrival.","ts":"2026-09-27T08:12:21Z"}
  ]'::jsonb,
  'hybrid',
  4, 2,
  NOW() - INTERVAL '3 days 4 hours 20 minutes',
  NOW() - INTERVAL '3 days 4 hours 15 minutes',
  NOW() - INTERVAL '3 days 4 hours 15 minutes',
  '{"preferred_plug":"type_2","preferred_location":"M1","preferred_charge_start":"09:00","charge_target_pct":90}'::jsonb,
  NOW() - INTERVAL '3 days 4 hours 20 minutes',
  NOW() - INTERVAL '3 days 4 hours 15 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Marcus: agentic mode — auto-schedule overnight smart charge
INSERT INTO ai_sessions (
  id, user_id,
  messages, ai_mode,
  turn_count, tool_call_count,
  started_at, last_active_at, ended_at,
  extracted_prefs,
  created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '[
    {"role":"ai","content":"[Agentic] Checking Octopus Agile rates for tonight. Cheapest 3-hour window: 01:30–04:30 at 8.2p/kWh. Scheduling smart charge to bring Tesla to 85% SoC. No action needed.","ts":"2026-09-28T21:00:01Z"},
    {"role":"ai","content":"[Agentic] Smart charge scheduled: 01:30 tonight at Sarah''s home charger (SW9). Estimated cost £1.82. I''ll notify you when complete.","ts":"2026-09-28T21:00:03Z"}
  ]'::jsonb,
  'agentic',
  2, 3,
  NOW() - INTERVAL '2 days 3 hours',
  NOW() - INTERVAL '2 days 3 hours',
  NOW() - INTERVAL '2 days 3 hours',
  '{"preferred_tariff":"octopus_agile","ai_auto_schedule":true}'::jsonb,
  NOW() - INTERVAL '2 days 3 hours',
  NOW() - INTERVAL '2 days 3 hours'
) ON CONFLICT (id) DO NOTHING;

-- Dev: fault diagnosis conversation (AI noticed OCPP error, reported to Dev)
INSERT INTO ai_sessions (
  id, user_id,
  messages, ai_mode,
  turn_count, tool_call_count,
  started_at, last_active_at, ended_at,
  created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  '[
    {"role":"ai","content":"[Alert] Charger DEV-NEXUS-002 reported error code E05 (Communication Error) at 14:22. I''ve run a fault diagnosis — likely cause: intermittent network drop at the charge point. Recommended action: restart the charger remotely or ask the driver to unplug and retry. Shall I send a Remote Reset command?","ts":"2026-09-26T14:25:00Z"},
    {"role":"human","content":"Yes, send the reset","ts":"2026-09-26T14:26:10Z"},
    {"role":"ai","content":"Remote Reset sent to DEV-NEXUS-002. Charger came back online at 14:27. The affected session has been extended automatically. No booking cancellations needed.","ts":"2026-09-26T14:27:30Z"}
  ]'::jsonb,
  'hybrid',
  3, 2,
  NOW() - INTERVAL '4 days 9 hours',
  NOW() - INTERVAL '4 days 9 hours',
  NOW() - INTERVAL '4 days 9 hours',
  NULL,
  NOW() - INTERVAL '4 days 9 hours',
  NOW() - INTERVAL '4 days 9 hours'
) ON CONFLICT (id) DO NOTHING;

-- Sarah: pricing optimisation suggestion
INSERT INTO ai_sessions (
  id, user_id,
  messages, ai_mode,
  turn_count, tool_call_count,
  started_at, last_active_at, ended_at,
  created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '[
    {"role":"ai","content":"Your charger has had 100% utilisation for 3 weeks running. Similar listings in SW9 are priced at 36–38p/kWh. Your current rate is 34p/kWh. Increasing to 36p/kWh could add £22/month to your earnings with no expected change in booking rate. Want me to update your price?","ts":"2026-09-25T10:00:00Z"},
    {"role":"human","content":"Yes, do it","ts":"2026-09-25T10:01:22Z"},
    {"role":"ai","content":"Price updated to 36p/kWh. I''ll monitor booking rate over the next 7 days and let you know if there''s any impact.","ts":"2026-09-25T10:01:25Z"}
  ]'::jsonb,
  'hybrid',
  3, 1,
  NOW() - INTERVAL '5 days 2 hours',
  NOW() - INTERVAL '5 days 2 hours',
  NOW() - INTERVAL '5 days 2 hours',
  NULL,
  NOW() - INTERVAL '5 days 2 hours',
  NOW() - INTERVAL '5 days 2 hours'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- AGENT TASKS
-- ──────────────────────────────────────────────────────────────

-- Task 1: fault diagnosis — Dev's charger E05 error (completed)
INSERT INTO agent_tasks (
  id, task_type, status,
  user_id,
  source_event_id,
  input_payload,
  result_summary, result_payload,
  requires_confirmation, confirmed_at, confirmed_by,
  started_at, completed_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'fault_diagnosis', 'completed',
  '10000000-0000-0000-0000-000000000002',
  'ocpp-event-DEV-NEXUS-002-20260926-E05',
  '{"charger_id":"DEV-NEXUS-002","error_code":"E05","error_info":"Communication Error","vendor_error_code":"NET_TIMEOUT","timestamp":"2026-09-26T14:22:00Z"}'::jsonb,
  'E05 Communication Error on DEV-NEXUS-002. Likely cause: intermittent network drop. Remote Reset sent at 14:27. Charger recovered. No bookings affected.',
  '{"diagnosis":"network_dropout","confidence":0.87,"action_taken":"remote_reset","charger_recovered":true,"recovery_time_seconds":90,"affected_bookings":[]}'::jsonb,
  true,
  NOW() - INTERVAL '4 days 9 hours',
  '10000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '4 days 9 hours 5 minutes',
  NOW() - INTERVAL '4 days 9 hours',
  NOW() - INTERVAL '4 days 9 hours 6 minutes',
  NOW() - INTERVAL '4 days 9 hours'
) ON CONFLICT (id) DO NOTHING;

-- Task 2: tariff scheduling — Marcus overnight smart charge (completed)
INSERT INTO agent_tasks (
  id, task_type, status,
  user_id,
  source_event_id,
  input_payload,
  result_summary, result_payload,
  requires_confirmation,
  started_at, completed_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'tariff_scheduling', 'completed',
  '10000000-0000-0000-0000-000000000003',
  NULL,
  '{"user_id":"10000000-0000-0000-0000-000000000003","vehicle_id":"10000000-0000-0000-3000-000000000003","current_soc_pct":41,"target_soc_pct":85,"listing_id":"20000000-0000-0000-0000-000000000001","tariff":"octopus_agile","trigger":"nightly_scheduler"}'::jsonb,
  'Cheapest 3-hr window 01:30–04:30 at avg 8.2p/kWh. Smart charge scheduled. Estimated cost £1.82.',
  '{"window_start":"2026-09-28T01:30:00Z","window_end":"2026-09-28T04:30:00Z","avg_rate_pence":8.2,"estimated_cost_pence":182,"kwh_needed":22.1,"schedule_id":"c0000000-0000-0000-0000-000000000001"}'::jsonb,
  false,
  NOW() - INTERVAL '2 days 3 hours 2 minutes',
  NOW() - INTERVAL '2 days 3 hours',
  NOW() - INTERVAL '2 days 3 hours 5 minutes',
  NOW() - INTERVAL '2 days 3 hours'
) ON CONFLICT (id) DO NOTHING;

-- Task 3: pricing suggestion — Sarah's charger (completed + accepted)
INSERT INTO agent_tasks (
  id, task_type, status,
  user_id,
  source_event_id,
  input_payload,
  result_summary, result_payload,
  requires_confirmation, confirmed_at, confirmed_by,
  started_at, completed_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000003',
  'pricing_suggestion', 'completed',
  '10000000-0000-0000-0000-000000000001',
  'utilisation-check-20000000-0000-0000-0000-000000000001',
  '{"listing_id":"20000000-0000-0000-0000-000000000001","current_price_pence":34,"utilisation_pct":100,"nearby_avg_price_pence":37,"weeks_at_full_utilisation":3}'::jsonb,
  'Suggested price increase from 34p → 36p/kWh based on 100% 3-week utilisation. Host accepted. Price updated.',
  '{"suggested_price_pence":36,"accepted":true,"estimated_monthly_uplift_pence":2200,"market_p25":34,"market_p75":38}'::jsonb,
  true,
  NOW() - INTERVAL '5 days 1 hour 59 minutes',
  '10000000-0000-0000-0000-000000000001',
  NOW() - INTERVAL '5 days 2 hours 1 minute',
  NOW() - INTERVAL '5 days 1 hour 59 minutes',
  NOW() - INTERVAL '5 days 2 hours 2 minutes',
  NOW() - INTERVAL '5 days 1 hour 59 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Task 4: recurring booking suggestion for Marcus (pending confirmation)
INSERT INTO agent_tasks (
  id, task_type, status,
  user_id,
  source_event_id,
  input_payload,
  result_summary, result_payload,
  requires_confirmation,
  started_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000004',
  'recurring_booking', 'pending',
  '10000000-0000-0000-0000-000000000003',
  'pattern-detect-10000000-0000-0000-0000-000000000003',
  '{"user_id":"10000000-0000-0000-0000-000000000003","pattern":"weekday_morning_manchester","sessions_analysed":12,"confidence":0.91}'::jsonb,
  'Detected 12-session commuter pattern: weekday mornings at Nexus Coworking. Suggesting standing Monday–Friday 08:00 booking.',
  '{"suggested_listing_id":"20000000-0000-0000-0000-000000000002","suggested_days":["mon","tue","wed","thu","fri"],"suggested_start":"08:00","suggested_duration_hours":3,"estimated_monthly_cost_pence":6600}'::jsonb,
  true,
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '1 hour'
) ON CONFLICT (id) DO NOTHING;

-- Task 5: idle fee alert (completed — notified Marcus)
INSERT INTO agent_tasks (
  id, task_type, status,
  user_id,
  source_event_id,
  input_payload,
  result_summary, result_payload,
  requires_confirmation,
  started_at, completed_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000005',
  'idle_fee_alert', 'completed',
  '10000000-0000-0000-0000-000000000003',
  'session-complete-50000000-0000-0000-0000-000000000001',
  '{"session_id":"50000000-0000-0000-0000-000000000001","soc_pct":92,"idle_fee_per_min_pence":12,"grace_period_minutes":15}'::jsonb,
  'Session complete at 92% SoC. Push notification sent: "Charging done! Move your car within 15 mins to avoid idle fees."',
  '{"notification_sent":true,"notification_channel":"push","idle_fee_started":false}'::jsonb,
  false,
  NOW() - INTERVAL '3 days 1 hour 1 minute',
  NOW() - INTERVAL '3 days 1 hour',
  NOW() - INTERVAL '3 days 1 hour 2 minutes',
  NOW() - INTERVAL '3 days 1 hour'
) ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- VOICE COMMANDS
-- ──────────────────────────────────────────────────────────────

-- Marcus: booking voice command (Web Speech API)
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'Hey Zipgrid find me a charger near Manchester Piccadilly with Type 2 available tomorrow morning',
  'en-GB',
  'find_charger', 0.954,
  '{"location":"Manchester Piccadilly","plug_type":"type_2","time_preference":"tomorrow morning"}'::jsonb,
  '/map',
  'Found 3 chargers near Manchester Piccadilly. Nexus Coworking has a 7.4 kW Type 2 available from 08:00 tomorrow.',
  'map_filter_and_zoom',
  NULL,
  'web_speech', 340,
  NOW() - INTERVAL '3 days 4 hours 20 minutes'
) ON CONFLICT DO NOTHING;

-- Marcus: book charger command
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'Book it for 3 hours starting at 9am',
  'en-GB',
  'book_charger', 0.981,
  '{"listing_id":"20000000-0000-0000-0000-000000000002","duration_hours":3,"start_time":"09:00","date":"tomorrow"}'::jsonb,
  '/listings/20000000-0000-0000-0000-000000000002',
  'Booking confirmed! Nexus Coworking, 09:00–12:00 tomorrow. Estimated cost £8.24.',
  'create_booking',
  true,
  'web_speech', 1820,
  NOW() - INTERVAL '3 days 4 hours 19 minutes'
) ON CONFLICT DO NOTHING;

-- Marcus: session status check
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'How much has my car charged?',
  'en-GB',
  'session_status', 0.973,
  '{"session_id":"50000000-0000-0000-0000-000000000001"}'::jsonb,
  '/session',
  'Your Tesla has charged 26.4 kilowatt hours, reaching 92 percent. Total cost so far is £8.24. Charging is complete.',
  'show_session_status',
  NULL,
  'web_speech', 290,
  NOW() - INTERVAL '3 days 1 hour 5 minutes'
) ON CONFLICT DO NOTHING;

-- Marcus: spend query
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'How much have I spent on charging this month?',
  'en-GB',
  'spend_query', 0.968,
  '{"period":"this_month"}'::jsonb,
  '/wallet',
  'You have spent £41.20 on charging this month across 6 sessions. Your average cost per session is £6.87.',
  'show_wallet_summary',
  NULL,
  'web_speech', 310,
  NOW() - INTERVAL '7 days'
) ON CONFLICT DO NOTHING;

-- Andy: voice command via Whisper fallback (poor mic quality)
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  'find charger near me',
  'en-GB',
  'find_charger', 0.841,
  '{"location":"current_location","radius_km":5}'::jsonb,
  '/map',
  'Showing chargers near your location. I found 8 chargers within 5 miles.',
  'map_show_nearby',
  NULL,
  'whisper', 1240,
  NOW() - INTERVAL '7 days'
) ON CONFLICT DO NOTHING;

-- Sarah: host voice command — earnings query
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'What did I earn this week?',
  'en-GB',
  'spend_query', 0.911,
  '{"context":"host_earnings","period":"this_week"}'::jsonb,
  '/host/earnings',
  'You earned £67.40 this week from 8 charging sessions. That is up 12 percent on last week.',
  'show_host_earnings',
  NULL,
  'web_speech', 280,
  NOW() - INTERVAL '2 days'
) ON CONFLICT DO NOTHING;

-- Low-confidence fallback (unknown intent) — for monitoring dashboard
INSERT INTO voice_commands (
  user_id, transcript, language,
  intent, confidence, params_json,
  page_context, speech_response, action_type,
  user_confirmed, stt_method, latency_ms, created_at
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  'erm what does like the green thing mean',
  'en-GB',
  'unknown', 0.312,
  '{}'::jsonb,
  '/map',
  'I didn''t quite catch that. You can ask me to find a charger, check your session, or view your wallet.',
  'show_suggestions',
  NULL,
  'web_speech', 580,
  NOW() - INTERVAL '6 days'
) ON CONFLICT DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- GRID SCHEDULES (smart charging + agentic scheduling)
-- ──────────────────────────────────────────────────────────────

-- Marcus: completed overnight smart charge
INSERT INTO grid_schedules (
  id, user_id, vehicle_id, listing_id,
  type, status,
  window_start, window_end,
  target_soc_pct, max_charge_kw,
  tariff_name, expected_rate_pence_per_kwh,
  actual_energy_wh,
  created_by_agent, agent_task_id,
  created_at, updated_at
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-3000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  'smart_charge', 'completed',
  NOW() - INTERVAL '1 day 22 hours 30 minutes',
  NOW() - INTERVAL '1 day 19 hours 30 minutes',
  85, 7.4,
  'octopus_agile', 8.2,
  22100,
  true, 'b0000000-0000-0000-0000-000000000002',
  NOW() - INTERVAL '2 days 3 hours',
  NOW() - INTERVAL '1 day 19 hours 30 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Marcus: upcoming scheduled charge (tomorrow morning — for live demo)
INSERT INTO grid_schedules (
  id, user_id, vehicle_id, listing_id,
  type, status,
  window_start, window_end,
  target_soc_pct, max_charge_kw,
  tariff_name, expected_rate_pence_per_kwh,
  created_by_agent,
  created_at, updated_at
) VALUES (
  'c0000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-3000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  'smart_charge', 'scheduled',
  NOW() + INTERVAL '2 hours',
  NOW() + INTERVAL '5 hours',
  90, 7.4,
  'octopus_agile', 7.8,
  true,
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '30 minutes'
) ON CONFLICT (id) DO NOTHING;

COMMIT;
