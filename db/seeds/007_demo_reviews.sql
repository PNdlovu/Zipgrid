-- ============================================================
-- Zipgrid Demo Seed 007 — Demo Reviews
-- ============================================================
-- Publishes reviews for the completed sessions.
-- Uses blind-reveal mechanic: both sides submitted → published.
-- Depends on: 005_demo_bookings.sql, 006_demo_sessions.sql
-- ============================================================

BEGIN;

-- Driver review: Marcus reviews Sarah's listing (booking 2 via session)
-- (Using booking 1 for now as the completed one is booking 2)
INSERT INTO reviews (
  id, booking_id, reviewer_user_id,
  listing_id, subject,
  overall_rating,
  rating_accuracy, rating_reliability, rating_location, rating_value, rating_communication,
  comment, status, revealed_at,
  created_at, updated_at
) VALUES (
  '60000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'listing',
  5,
  5, 5, 4, 5, 5,
  'Brilliant charger and super easy access. The co-working space was a bonus — got 3 hours of work done while the Tesla charged. Highly recommend!',
  'published',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days 30 minutes',
  NOW() - INTERVAL '3 days'
) ON CONFLICT (id) DO NOTHING;

-- Host review: Dev reviews Marcus as a driver
INSERT INTO reviews (
  id, booking_id, reviewer_user_id, reviewee_user_id,
  subject,
  overall_rating,
  rating_behaviour, rating_timeliness,
  comment, status, revealed_at,
  created_at, updated_at
) VALUES (
  '60000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  'driver',
  5,
  5, 5,
  'Marcus was punctual and left the bay exactly as he found it. Would absolutely welcome back.',
  'published',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days 25 minutes',
  NOW() - INTERVAL '3 days'
) ON CONFLICT (id) DO NOTHING;

-- Update listing review stats
UPDATE charger_listings
SET
  average_rating = (
    SELECT ROUND(AVG(overall_rating)::NUMERIC, 2)
    FROM reviews
    WHERE listing_id = '20000000-0000-0000-0000-000000000002'
      AND status = 'published' AND subject = 'listing'
  ),
  review_count = (
    SELECT COUNT(*)::INT
    FROM reviews
    WHERE listing_id = '20000000-0000-0000-0000-000000000002'
      AND status = 'published' AND subject = 'listing'
  ),
  total_kwh_delivered = total_kwh_delivered + 26.4,
  updated_at = NOW()
WHERE id = '20000000-0000-0000-0000-000000000002';

COMMIT;
