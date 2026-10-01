-- ============================================================
-- Zipgrid Master Migration Runner
-- ============================================================
-- Run this file against a fresh PostgreSQL database to build
-- the complete schema from scratch (all 12 migrations).
--
-- Prerequisites:
--   1. PostgreSQL 14+ with PostGIS extension installed
--   2. A database already created:
--        CREATE DATABASE zipgrid_dev;
--   3. PostGIS on the server:
--        sudo apt install postgresql-15-postgis-3
--
-- Usage (psql):
--   psql -U postgres -d zipgrid_dev -f db/migrate.sql
--
-- Usage (Docker one-liner):
--   docker exec -i <container> psql -U postgres -d zipgrid_dev \
--     < db/migrate.sql
--
-- To also load seed data after migration (dev/staging only):
--   psql -U postgres -d zipgrid_dev \
--     -f db/migrate.sql \
--     -f db/seeds/001_seed.sql \
--     -f db/seeds/002_demo_extended.sql
-- ============================================================

\echo ''
\echo '╔══════════════════════════════════════════════════════╗'
\echo '║       Zipgrid Database Migration Runner              ║'
\echo '╚══════════════════════════════════════════════════════╝'
\echo ''

-- ── Foundation ────────────────────────────────────────────

\echo '=== [1/12] Extensions (PostGIS, pgcrypto, citext) ==='
\ir migrations/001_extensions.sql

\echo '=== [2/12] Core users, driver profiles, host profiles ==='
\ir migrations/002_core_users.sql

\echo '=== [3/12] Charger listings (PostGIS geometry) ==='
\ir migrations/003_charger_listings.sql

\echo '=== [4/12] Bookings, sessions, payments, transactions ==='
\ir migrations/004_bookings_sessions_payments.sql

\echo '=== [5/12] Reviews, notifications, incidents, disputes ==='
\ir migrations/005_reviews_notifications_insurance.sql

-- ── Auth & Devices ─────────────────────────────────────────

\echo '=== [6/12] Auth OTP codes and session management ==='
\ir migrations/006_auth_otp_sessions.sql

\echo '=== [7/12] Charger devices, OCPP event log ==='
\ir migrations/007_charger_devices_ocpp_log.sql

-- ── Extended Booking & Payments ────────────────────────────

\echo '=== [8/12] Booking flow payments (Stripe webhook idempotency) ==='
\ir migrations/008_booking_flow_payments.sql

-- ── AI ─────────────────────────────────────────────────────

\echo '=== [9/12] AI conversation sessions and agent tasks ==='
\ir migrations/009_ai_sessions_agent_tasks.sql

-- ── Marketplace ────────────────────────────────────────────

\echo '=== [10/12] Marketplace — products, installers, jobs ==='
\ir migrations/010_marketplace.sql

-- ── Wallet, Rewards, Emergency, Safety ────────────────────

\echo '=== [11/12] Wallet, rewards, emergency, safety scores, webhooks ==='
\ir migrations/011_wallet_rewards_emergency_safety_webhooks.sql

-- ── Compliance, Payouts, Support ──────────────────────────

\echo '=== [12/12] Payout batches, GDPR, support chat, charger connectors ==='
\ir migrations/012_payout_gdpr_support_charger_connectors.sql

\echo ''
\echo '✓ All 12 migrations complete.'
\echo ''
\echo 'Next steps:'
\echo '  Load seed data:  psql ... -f db/seeds/001_seed.sql'
\echo '  Extended demo:   psql ... -f db/seeds/002_demo_extended.sql'
\echo ''
