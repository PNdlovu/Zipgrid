-- ============================================================
-- Zipgrid Master Migration Runner
-- ============================================================
-- Run this file against a fresh PostgreSQL database to build
-- the complete schema from scratch.
--
-- Prerequisites:
--   1. PostgreSQL 14+ (GENERATED ALWAYS AS STORED requires 12+,
--      GEOGRAPHY type requires PostGIS extension)
--   2. A database already created:
--        CREATE DATABASE zipgrid_dev;
--   3. PostGIS installed on the server
--        (e.g. sudo apt install postgresql-15-postgis-3)
--
-- Usage (psql):
--   psql -U postgres -d zipgrid_dev -f db/migrate.sql
--
-- Usage (Docker one-liner):
--   docker exec -i <container> psql -U postgres -d zipgrid_dev \
--     < db/migrate.sql
--
-- To also load seed data (dev/staging only):
--   psql -U postgres -d zipgrid_dev \
--     -f db/migrate.sql \
--     -f db/seeds/001_seed.sql
-- ============================================================

\echo '=== [1/5] Enabling extensions ==='
\ir migrations/001_extensions.sql

\echo '=== [2/5] Core users, drivers & hosts ==='
\ir migrations/002_core_users.sql

\echo '=== [3/5] Charger listings (PostGIS) ==='
\ir migrations/003_charger_listings.sql

\echo '=== [4/5] Bookings, sessions & payments ==='
\ir migrations/004_bookings_sessions_payments.sql

\echo '=== [5/5] Reviews, notifications & insurance ==='
\ir migrations/005_reviews_notifications_insurance.sql

\echo '=== Schema migration complete ==='
