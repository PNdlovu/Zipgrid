-- 026_concierge_host_actions.sql
-- The concierge can also act for hosts: a price change or booking approval
-- it proposes is a concierge_actions row, confirmed in a later turn.

ALTER TABLE concierge_actions DROP CONSTRAINT IF EXISTS concierge_actions_kind_check;
ALTER TABLE concierge_actions ADD CONSTRAINT concierge_actions_kind_check
    CHECK (kind IN ('book', 'cancel_booking', 'stop_session', 'update_price', 'approve_booking'));
