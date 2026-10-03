-- 021_wallet_payments.sql
-- Wallet as a booking payment method.
--
-- Model: wallet_balances.balance_pence is the wallet's total; pending_pence is
-- the part reserved for open wallet-paid bookings (available = balance − pending).
-- A wallet-paid booking reserves its estimated cost instead of placing a card
-- hold, so its transaction row has no PaymentIntent. Settlement debits the
-- final cost from the balance and drops the reservation; cancellation and
-- no-shows only drop the reservation.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_source VARCHAR(10) NOT NULL DEFAULT 'card';
ALTER TABLE transactions ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pay_with_wallet BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
    ALTER TABLE transactions ADD CONSTRAINT chk_transactions_payment_source
        CHECK (payment_source IN ('card', 'wallet'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE transactions ADD CONSTRAINT chk_transactions_card_has_pi
        CHECK (payment_source = 'wallet' OR stripe_payment_intent_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reservations can never exceed the wallet total.
DO $$ BEGIN
    ALTER TABLE wallet_balances ADD CONSTRAINT chk_wallet_pending_within_balance
        CHECK (pending_pence <= balance_pence);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A Stripe top-up can credit a wallet only once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_topup_pi
    ON wallet_transactions (stripe_pi_id) WHERE type = 'topup' AND stripe_pi_id IS NOT NULL;
-- One settlement debit per booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_session_payment
    ON wallet_transactions (booking_id) WHERE type = 'session_payment' AND booking_id IS NOT NULL;
