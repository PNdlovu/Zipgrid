-- ============================================================
-- Migration 018: Enum values required by the application
-- ============================================================
-- Kept in its own migration: PostgreSQL does not allow a newly added enum
-- value to be used inside the same transaction, and 019 uses these values.
-- ============================================================

-- 'active' = booking whose charging session is in progress.
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'active' AFTER 'confirmed';

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'installer';

-- OCPP 'Preparing' (RemoteStart sent, waiting for StartTransaction) and
-- 'paused' (SuspendedEV / SuspendedEVSE).
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'preparing' BEFORE 'charging';
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'paused' AFTER 'charging';

-- Dispute statuses: align names with the resolution centre / admin UI.
DO $$
DECLARE
    pair TEXT[];
BEGIN
    FOREACH pair SLICE 1 IN ARRAY ARRAY[
        ARRAY['platform_reviewing',  'under_review'],
        ARRAY['resolved_for_driver', 'resolved_driver_favour'],
        ARRAY['resolved_for_host',   'resolved_host_favour']
    ] LOOP
        IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                   WHERE t.typname = 'dispute_status' AND e.enumlabel = pair[1]) THEN
            EXECUTE format('ALTER TYPE dispute_status RENAME VALUE %L TO %L', pair[1], pair[2]);
        END IF;
    END LOOP;
END $$;
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'evidence_requested' AFTER 'open';
ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'evidence_received' AFTER 'evidence_requested';

-- Dispute categories offered by the resolution centre.
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'session_fault';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'charger_unavailable';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'billing';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'property_damage';
ALTER TYPE dispute_type ADD VALUE IF NOT EXISTS 'driver_behaviour';
