-- "Never lose a payment again": a payment_attempts row is now recorded the
-- moment a Razorpay order is created (razorpay-create-order), before the
-- customer ever sees the payment sheet — not only after a successful client
-- callback, as before. That row starts life with no payment_id (we don't
-- have Razorpay's payment id yet) and gets filled in once the payment
-- settles, whichever path notices first: the client callback
-- (razorpay-verify-payment), the Razorpay webhook, or the hourly sweep.

ALTER TABLE public.payment_attempts
  ALTER COLUMN payment_id DROP NOT NULL;

-- Scoped to still-"initiated" rows (payment_id still null) rather than every
-- row: historical rows (all created with payment_id set from day one) may
-- legitimately share a razorpay_order_id — e.g. a customer whose first
-- payment attempt on an order failed and who paid on retry — so a blanket
-- unique index over all rows would risk failing against existing data
-- instead of just enforcing the one thing that's actually new: settlePayment
-- looks up the still-open "initiated" row by razorpay_order_id (webhook and
-- sweep only ever know the order id, not which payment_attempts row it is).
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_initiated_razorpay_order_id_key
  ON public.payment_attempts (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL AND payment_id IS NULL;

-- No status check existed before. Normalise anything unexpected first so
-- adding the constraint can't fail against existing data, then codify the
-- values already in use (pending, converted, dismissed) plus the two new
-- lifecycle states.
UPDATE public.payment_attempts
SET status = 'pending'
WHERE status NOT IN ('initiated', 'pending', 'converted', 'dismissed', 'failed');

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_status_check
  CHECK (status IN ('initiated', 'pending', 'converted', 'dismissed', 'failed'));

-- Hourly sweep: any "initiated" row (payment started, never confirmed) older
-- than 15 minutes is checked against Razorpay directly and settled or
-- marked failed. Belt-and-braces alongside the webhook.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sweep-pending-payments-hourly';

SELECT cron.schedule(
  'sweep-pending-payments-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xisbpiahuomfvawcoicz.supabase.co/functions/v1/sweep-pending-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpc2JwaWFodW9tZnZhd2NvaWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MDA5MzgsImV4cCI6MjA4MzA3NjkzOH0.xXZFPBLxVYViSVQo5rw-VsHigXJjUHp_CS4t6jnNysk'
    ),
    body := '{}'::jsonb
  );
  $$
);
