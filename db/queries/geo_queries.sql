-- ============================================================
-- Zipgrid PostGIS Geo-Query Library
-- ============================================================
-- All queries use GEOGRAPHY(POINT, 4326) — WGS84 lat/lng.
-- ST_DWithin on GEOGRAPHY measures distance in METERS.
-- ST_Distance on GEOGRAPHY returns meters.
-- The GIST index on charger_listings.location makes every
-- radius search here an index scan, not a full table scan.
--
-- Usage in Next.js / Node.js:
--   Pass $1 = longitude, $2 = latitude, $3 = radius_meters
--   via parameterized queries (pg / postgres.js / Drizzle raw).
-- ============================================================


-- ============================================================
-- QUERY 1: Find Active Chargers Within a Radius
-- ============================================================
-- The primary map search query. Returns listings within N km
-- of a driver's location, ordered by proximity.
-- Replace $3 with meters: 5km = 5000, 10km = 10000.
-- ============================================================

-- Q1a: Basic radius search (all active listings near a point)
SELECT
    cl.id,
    cl.title,
    cl.address_line1,
    cl.city,
    cl.state_province,
    cl.latitude,
    cl.longitude,
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.pricing_model,
    cl.price_per_kwh_cents,
    cl.price_per_hour_cents,
    cl.price_per_session_cents,
    cl.average_rating,
    cl.review_count,
    cl.instant_book_enabled,
    cl.amenity_tags,
    -- Distance in meters from driver's current position
    ROUND(
        ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        )::NUMERIC,
        0
    ) AS distance_meters,
    -- Convenience: distance in miles (1m = 0.000621371 miles)
    ROUND(
        (ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        ) * 0.000621371)::NUMERIC,
        2
    ) AS distance_miles
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    -- ST_DWithin uses the GIST index — much faster than ST_Distance filter
    AND ST_DWithin(
        cl.location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY,
        $3   -- radius in meters
    )
ORDER BY
    distance_meters ASC
LIMIT 50;


-- ============================================================
-- QUERY 2: Radius Search with Plug Type Filter
-- ============================================================
-- Driver's vehicle only supports CCS1 and NACS — only show
-- chargers that have AT LEAST ONE of those plug types.
-- Uses the GIN index on plug_types for fast array containment.
-- $4 = ARRAY['CCS1','NACS']::plug_type[]
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.plug_types,
    cl.max_power_kw,
    cl.charger_level,
    cl.price_per_kwh_cents,
    cl.average_rating,
    ROUND(
        ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        )::NUMERIC, 0
    ) AS distance_meters
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    AND ST_DWithin(
        cl.location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY,
        $3
    )
    -- && = array overlap operator: listing has ANY of the driver's plug types
    AND cl.plug_types && $4::plug_type[]
ORDER BY
    distance_meters ASC
LIMIT 50;


-- ============================================================
-- QUERY 3: Full Driver Map Search with ALL Filters
-- ============================================================
-- Production query combining: radius + plug type + charger
-- level + minimum power + amenities + price cap + availability
-- on a specific day/time window.
--
-- Parameters:
--   $1  = driver longitude
--   $2  = driver latitude
--   $3  = radius in meters
--   $4  = plug_types array  e.g. ARRAY['CCS1','J1772']::plug_type[]
--   $5  = charger_level     e.g. 'level_2'::charger_level  (NULL = any)
--   $6  = min_power_kw      e.g. 7.0  (NULL = any)
--   $7  = max_price_per_kwh_cents  e.g. 40  (NULL = any)
--   $8  = requires_wifi     e.g. TRUE  (NULL = skip filter)
--   $9  = desired_day       e.g. 'tuesday'::day_of_week
--   $10 = desired_time      e.g. '14:00'::TIME
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.address_line1,
    cl.city,
    cl.latitude,
    cl.longitude,
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.pricing_model,
    cl.price_per_kwh_cents,
    cl.price_per_hour_cents,
    cl.average_rating,
    cl.review_count,
    cl.instant_book_enabled,
    cl.wifi_available,
    cl.restroom_available,
    cl.shelter_available,
    cl.wheelchair_accessible,
    cl.amenity_tags,
    -- Cover photo (first element of array)
    cl.photo_urls[1]                    AS cover_photo_url,
    ROUND(
        ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        )::NUMERIC, 0
    )                                   AS distance_meters,
    -- Availability window for this listing on the requested day
    avs.open_time,
    avs.close_time,
    -- Is there a blackout on the requested date?
    (
        SELECT COUNT(*) > 0
        FROM   listing_blackout_dates lbd
        WHERE  lbd.listing_id   = cl.id
          AND  lbd.blackout_date = CURRENT_DATE
    )                                   AS is_blacked_out
FROM
    charger_listings cl
    -- LEFT JOIN so listings without a schedule still appear
    -- (they may be 'always_open' access type)
    LEFT JOIN listing_availability_schedules avs
        ON  avs.listing_id   = cl.id
        AND avs.day_of_week  = $9::day_of_week
        AND avs.is_available = TRUE
WHERE
    cl.status = 'active'
    AND ST_DWithin(
        cl.location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY,
        $3
    )
    AND ($4 IS NULL OR cl.plug_types && $4::plug_type[])
    AND ($5 IS NULL OR cl.charger_level = $5::charger_level)
    AND ($6 IS NULL OR cl.max_power_kw  >= $6::NUMERIC)
    AND ($7 IS NULL OR cl.price_per_kwh_cents <= $7::INT)
    AND ($8 IS NULL OR cl.wifi_available = $8::BOOLEAN)
    -- Only show listings that are open at the requested time
    -- (NULL avs rows = no schedule set = always available)
    AND (
        avs.listing_id IS NOT NULL
        OR cl.access_type = 'always_open'
    )
    AND (
        avs.listing_id IS NULL
        OR ($10::TIME BETWEEN avs.open_time AND avs.close_time)
    )
    -- Exclude listings with a blackout on the requested date
    AND NOT EXISTS (
        SELECT 1
        FROM   listing_blackout_dates lbd
        WHERE  lbd.listing_id    = cl.id
          AND  lbd.blackout_date = CURRENT_DATE
    )
ORDER BY
    -- Composite sort: proximity first, then quality score
    distance_meters ASC,
    cl.average_rating DESC NULLS LAST,
    cl.review_count   DESC
LIMIT 50;


-- ============================================================
-- QUERY 4: Bounding Box Search (Map Viewport Pan/Zoom)
-- ============================================================
-- When driver pans the map, fetch all active listings within
-- the visible viewport rectangle rather than a radius circle.
-- Much more efficient for map tile rendering.
--
-- Parameters:
--   $1 = min_longitude (west edge)
--   $2 = min_latitude  (south edge)
--   $3 = max_longitude (east edge)
--   $4 = max_latitude  (north edge)
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.latitude,
    cl.longitude,
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.price_per_kwh_cents,
    cl.average_rating,
    cl.instant_book_enabled,
    cl.photo_urls[1] AS cover_photo_url
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    -- ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid) builds bbox polygon
    AND cl.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::GEOGRAPHY
ORDER BY
    cl.average_rating DESC NULLS LAST
LIMIT 200;  -- cap for map cluster rendering


-- ============================================================
-- QUERY 5: Nearest N Chargers to a Point (no radius limit)
-- ============================================================
-- Used for "Chargers near you" home screen widget.
-- Returns the closest 5 active listings regardless of distance.
-- KNN (K-Nearest Neighbour) via <-> operator uses GIST index.
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.city,
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.price_per_kwh_cents,
    cl.average_rating,
    cl.photo_urls[1] AS cover_photo_url,
    -- <-> is the PostGIS KNN distance operator (index-accelerated)
    cl.location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY AS knn_distance
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
ORDER BY
    -- ORDER BY with <-> triggers KNN index scan — no WHERE radius needed
    cl.location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
LIMIT 5;


-- ============================================================
-- QUERY 6: Chargers Available Right Now
-- ============================================================
-- "Available now" tab in the driver app.
-- Excludes listings that have an active/confirmed booking
-- overlapping the current time window.
--
-- Parameters:
--   $1 = driver longitude
--   $2 = driver latitude
--   $3 = radius in meters
--   $4 = session_duration_minutes (e.g. 60 = 1 hour session)
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.latitude,
    cl.longitude,
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.price_per_kwh_cents,
    cl.average_rating,
    ROUND(
        ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        )::NUMERIC, 0
    ) AS distance_meters
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    AND ST_DWithin(
        cl.location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY,
        $3
    )
    -- Exclude listings with a currently active or confirmed booking
    -- that overlaps [NOW, NOW + requested duration]
    AND NOT EXISTS (
        SELECT 1
        FROM   bookings b
        WHERE  b.listing_id = cl.id
          AND  b.status IN ('confirmed', 'pending')
          AND  b.scheduled_start < (NOW() + ($4 || ' minutes')::INTERVAL)
          AND  b.scheduled_end   > NOW()
    )
    -- Exclude listings with an active charging session right now
    AND NOT EXISTS (
        SELECT 1
        FROM   charging_sessions cs
        JOIN   bookings b ON b.id = cs.booking_id
        WHERE  b.listing_id = cl.id
          AND  cs.status IN ('charging', 'authorized', 'initializing')
    )
ORDER BY
    distance_meters ASC
LIMIT 30;


-- ============================================================
-- QUERY 7: Cluster Count by Grid Cell (Heatmap)
-- ============================================================
-- Groups listings into a coarse grid for heatmap visualisation
-- at low zoom levels. Uses ST_SnapToGrid to bin lat/lng coords.
-- Grid size 0.05 degrees ≈ ~5km cells.
-- ============================================================

SELECT
    ST_X(ST_SnapToGrid(cl.location::GEOMETRY, 0.05)) AS grid_lng,
    ST_Y(ST_SnapToGrid(cl.location::GEOMETRY, 0.05)) AS grid_lat,
    COUNT(*)                                          AS charger_count,
    AVG(cl.max_power_kw)                              AS avg_power_kw,
    AVG(cl.price_per_kwh_cents)                       AS avg_price_cents
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    AND cl.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::GEOGRAPHY
GROUP BY
    grid_lng, grid_lat
ORDER BY
    charger_count DESC;


-- ============================================================
-- QUERY 8: Host Earnings Summary with Spatial Context
-- ============================================================
-- Admin / host analytics: total earnings grouped by listing,
-- including the listing's distance from city center.
-- Useful for identifying highest-earning geographic zones.
--
-- Parameters:
--   $1 = city_center_longitude
--   $2 = city_center_latitude
--   $3 = host_profile_id (UUID)
-- ============================================================

SELECT
    cl.id                               AS listing_id,
    cl.title,
    cl.city,
    cl.charger_level,
    cl.total_bookings,
    cl.total_kwh_delivered,
    cl.total_revenue_cents,
    cl.average_rating,
    ROUND(
        ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        )::NUMERIC / 1000, 2            -- convert to km
    )                                   AS km_from_city_center,
    -- Total confirmed payout for this listing
    COALESCE(SUM(t.host_earnings_cents), 0) AS total_host_earnings_cents,
    COUNT(DISTINCT b.id)                AS confirmed_booking_count
FROM
    charger_listings cl
    LEFT JOIN bookings    b ON b.listing_id    = cl.id
                            AND b.status       = 'completed'
    LEFT JOIN transactions t ON t.booking_id   = b.id
                            AND t.status       = 'captured'
WHERE
    cl.host_profile_id = $3::UUID
GROUP BY
    cl.id, cl.title, cl.city, cl.charger_level,
    cl.total_bookings, cl.total_kwh_delivered,
    cl.total_revenue_cents, cl.average_rating, cl.location
ORDER BY
    total_host_earnings_cents DESC;


-- ============================================================
-- QUERY 9: Incident Density Map (Safety Heatmap)
-- ============================================================
-- Platform admin view: cluster incidents by geographic cell
-- to identify high-risk zones. Helps focus insurance audits.
-- ============================================================

SELECT
    ST_X(ST_SnapToGrid(ir.incident_location::GEOMETRY, 0.1)) AS grid_lng,
    ST_Y(ST_SnapToGrid(ir.incident_location::GEOMETRY, 0.1)) AS grid_lat,
    ir.incident_type,
    COUNT(*)                                                  AS incident_count,
    MAX(ir.actual_damage_cents)                               AS max_damage_cents
FROM
    incident_reports ir
WHERE
    ir.incident_location IS NOT NULL
    AND ir.created_at >= NOW() - INTERVAL '12 months'
GROUP BY
    grid_lng, grid_lat, ir.incident_type
HAVING
    COUNT(*) >= 2   -- only show cells with 2+ incidents
ORDER BY
    incident_count DESC;


-- ============================================================
-- QUERY 10: Find All Chargers Along a Route Corridor
-- ============================================================
-- Road-trip mode: driver provides a linestring (route geometry),
-- and we find all active chargers within N meters of that path.
-- The route WKT string is passed as a parameter from the app
-- after calling the Directions API (Mapbox / Google Routes).
--
-- Parameters:
--   $1 = route WKT string e.g. 'LINESTRING(-118.4 34.0, -117.2 34.5, ...)'
--   $2 = corridor_width_meters e.g. 10000 (10km either side of route)
--   $3 = plug_types array (optional)
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.city,
    cl.state_province,
    cl.latitude,
    cl.longitude,
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.price_per_kwh_cents,
    cl.average_rating,
    cl.photo_urls[1]    AS cover_photo_url,
    -- Perpendicular distance from the route line
    ROUND(
        ST_Distance(
            cl.location,
            ST_GeomFromText($1, 4326)::GEOGRAPHY
        )::NUMERIC, 0
    )                   AS distance_from_route_meters,
    -- Project the charger point onto the route to get "route progress" %
    -- (0 = trip start, 1 = trip end) — for ordering along the route
    ST_LineLocatePoint(
        ST_GeomFromText($1, 4326),
        cl.location::GEOMETRY
    )                   AS route_progress_pct
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    AND ST_DWithin(
        cl.location,
        ST_GeomFromText($1, 4326)::GEOGRAPHY,
        $2   -- corridor width in meters
    )
    AND ($3 IS NULL OR cl.plug_types && $3::plug_type[])
ORDER BY
    route_progress_pct ASC,     -- ordered along the route direction
    distance_from_route_meters ASC;


-- ============================================================
-- QUERY 11: Reverse Geocode — Listings in Same Neighbourhood
-- ============================================================
-- When a host creates a listing, show them nearby competing
-- listings to help them set a competitive price.
-- Excludes the host's own listing (if editing an existing one).
--
-- Parameters:
--   $1 = listing longitude
--   $2 = listing latitude
--   $3 = radius_meters (e.g. 2000 = 2km neighbourhood)
--   $4 = exclude_listing_id (UUID of listing being edited, or NULL)
-- ============================================================

SELECT
    cl.id,
    cl.title,
    cl.charger_level,
    cl.max_power_kw,
    cl.pricing_model,
    cl.price_per_kwh_cents,
    cl.price_per_hour_cents,
    cl.average_rating,
    cl.review_count,
    ROUND(
        ST_Distance(
            cl.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY
        )::NUMERIC, 0
    ) AS distance_meters
FROM
    charger_listings cl
WHERE
    cl.status = 'active'
    AND ST_DWithin(
        cl.location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::GEOGRAPHY,
        $3
    )
    AND ($4 IS NULL OR cl.id <> $4::UUID)
ORDER BY
    distance_meters ASC
LIMIT 20;


-- ============================================================
-- QUERY 12: Materialised View — Active Listing Map Pins
-- ============================================================
-- A materialised view pre-computes the lightweight pin data
-- for the map. Refresh every 5 minutes via pg_cron or a cron
-- job to avoid recomputing on every map load.
-- Dramatically reduces read load on charger_listings at scale.
-- ============================================================

CREATE MATERIALIZED VIEW mv_active_listing_pins AS
SELECT
    cl.id,
    cl.title,
    cl.latitude,
    cl.longitude,
    cl.location,                    -- kept for spatial queries against the MV
    cl.charger_level,
    cl.plug_types,
    cl.max_power_kw,
    cl.pricing_model,
    cl.price_per_kwh_cents,
    cl.price_per_hour_cents,
    cl.average_rating,
    cl.review_count,
    cl.instant_book_enabled,
    cl.photo_urls[1]                AS cover_photo_url,
    hp.host_type,
    hp.is_superhost
FROM
    charger_listings cl
    JOIN host_profiles hp ON hp.id = cl.host_profile_id
WHERE
    cl.status = 'active'
WITH DATA;

-- GIST index on the materialised view for spatial queries
CREATE INDEX idx_mv_pins_location
    ON mv_active_listing_pins USING GIST (location);

-- GIN index for plug type filtering on the MV
CREATE INDEX idx_mv_pins_plug_types
    ON mv_active_listing_pins USING GIN (plug_types);

-- Refresh command (run via pg_cron or application scheduler):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_active_listing_pins;
-- CONCURRENTLY requires a unique index:
CREATE UNIQUE INDEX idx_mv_pins_id ON mv_active_listing_pins (id);


-- ============================================================
-- QUERY 13: PostGIS Utility — Convert Address to Point
-- ============================================================
-- Helper: accepts a lat/lng pair and returns a properly typed
-- GEOGRAPHY point. Use this in application code before
-- inserting a new charger listing.
-- ============================================================

-- Usage example (not a stored procedure — run inline):
-- SELECT ST_SetSRID(ST_MakePoint(-118.4085, 33.9425), 4326)::GEOGRAPHY;

-- Verify a stored point's coordinates:
SELECT
    id,
    title,
    ST_Y(location::GEOMETRY)   AS stored_latitude,
    ST_X(location::GEOMETRY)   AS stored_longitude,
    ST_AsText(location)        AS wkt,
    ST_AsGeoJSON(location)     AS geojson
FROM charger_listings
WHERE id = $1::UUID;
