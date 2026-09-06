-- Backs the replay guard added to send-order-confirmation: without this, the
-- function had no record of whether a confirmation was already sent for an
-- order, so it would resend (and, since it takes a bare order_id with no
-- ownership check, could previously be asked to send) on every call.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;
