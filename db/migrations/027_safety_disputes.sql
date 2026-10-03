-- 027_safety_disputes.sql
-- Safety problems (injury, electrical fault, harassment) are reported through
-- the Resolution Centre like other disputes, so they reach the admin queue.
-- (IncidentService has no reporting route or admin view yet.)

ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'safety_incident';
