-- ============================================================
-- Migration 001: Enable Required PostgreSQL Extensions
-- ============================================================
-- PostGIS: spatial geometry types & geo-queries (proximity, radius)
-- pgcrypto: secure UUID generation
-- citext: case-insensitive text (for emails)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
