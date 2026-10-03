-- ============================================================
-- Migration 001: Enable Required PostgreSQL Extensions
-- ============================================================
-- pgcrypto: gen_random_uuid() and digest helpers
-- citext:   case-insensitive text (for emails)
--
-- Geospatial search uses plain lat/lng NUMERIC columns with a
-- bounding-box pre-filter + haversine distance (see
-- apps/web/src/lib/db/geo.ts), so no PostGIS is required and the
-- schema runs on any managed PostgreSQL 14+.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
