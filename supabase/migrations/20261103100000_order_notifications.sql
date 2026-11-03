-- Order notifications (Phase 1): SMS / WhatsApp order confirmation + admin
-- dispatch with an automatic dispatch message. OFF BY DEFAULT.
--
-- Design (NOTIFICATIONS_PHASE1_PLAN.md §4-6):
--   * order_notifications is an outbox and the history. A row is queued by
--     the database (paid-order trigger, or the admin Dispatch RPC) and sent
--     by the send-order-notifications edge function (cron). Nothing here
--     calls a provider, and nothing depends on the customer's browser.
--   * One row per (order, event, channel, seq): verify + webhook + sweep, or
--     an admin flipping payment_status back and forth, can't queue twice.
--     A deliberate admin "Resend" is the only way to get seq 2, 3, ...
--   * The orders trigger is insert-only and swallows every error, so it can
--     never block or roll back an order. With the setting off (the default,
--     and when the setting row is missing) it reads one setting and returns.
--   * No full customer phone number is stored in the outbox. The worker reads
--     it from the order at send time and stores only the last 4 digits.
--
-- Settings: platform_settings key 'order_notifications' (NOT created here;
-- missing = off). Shape:
--   { "mode": "off" | "record_only" | "live",
--     "sms":      { "enabled": false, "confirmation_flow_id": null, "dispatch_flow_id": null },
--     "whatsapp": { "enabled": false, "integrated_number": null, "language": "en",
--                   "confirmation_template": null, "dispatch_template": null } }
-- Real sending additionally needs the server secret ORDER_NOTIFICATIONS_LIVE=true
-- on the edge function (two-key activation) - see the worker.
--
-- Not touched: orders columns, any existing trigger or function, checkout
-- (place_order_atomic / quote_checkout / place_paid_order), Razorpay,
-- coupons, inventory, Express Delivery, registration, referrals, wallets.

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard: the orders columns this feature reads must exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['id', 'user_id', 'order_number', 'status', 'payment_status', 'total_amount',
                    'wallet_amount_used', 'shipping_address', 'fulfillment_type', 'created_at',
                    'admin_deleted_at']) AS c
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'orders is missing column(s) %; not installing order notifications', v_missing;
  END IF;
  IF to_regprocedure('public.is_any_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_any_admin(uuid) missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass
             AND tgname = 'queue_order_notifications_trg') THEN
    RAISE NOTICE 'queue_order_notifications_trg already exists; it will be recreated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('order_confirmed', 'order_dispatched')),
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  seq integer NOT NULL DEFAULT 1 CHECK (seq >= 1),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped', 'unknown')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  phone_last4 text CHECK (phone_last4 IS NULL OR phone_last4 ~ '^[0-9]{4}$'),
  provider_request_id text,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 300),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT order_notifications_once UNIQUE (order_id, event, channel, seq)
);
CREATE INDEX IF NOT EXISTS order_notifications_due_idx
  ON public.order_notifications (next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS order_notifications_sending_idx
  ON public.order_notifications (locked_at) WHERE status = 'sending';

CREATE TABLE IF NOT EXISTS public.order_dispatches (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_type text NOT NULL CHECK (partner_type IN ('in_house', 'rapido', 'porter', 'other')),
  partner_name text CHECK (partner_name IS NULL OR length(partner_name) BETWEEN 1 AND 60),
  rider_name text CHECK (rider_name IS NULL OR length(rider_name) BETWEEN 1 AND 60),
  rider_phone text NOT NULL CHECK (rider_phone ~ '^[6-9][0-9]{9}$'),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  dispatched_by uuid,
  updated_by uuid,
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_dispatches_other_needs_name CHECK (partner_type <> 'other' OR partner_name IS NOT NULL)
);

-- Admins read; nobody writes directly (RPCs below are SECURITY DEFINER).
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view order notifications" ON public.order_notifications;
CREATE POLICY "Admins can view order notifications" ON public.order_notifications
  FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));
DROP POLICY IF EXISTS "Admins can view order dispatches" ON public.order_dispatches;
CREATE POLICY "Admins can view order dispatches" ON public.order_dispatches
  FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));
REVOKE ALL ON public.order_notifications FROM anon;
REVOKE ALL ON public.order_dispatches FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_notifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_dispatches FROM authenticated;

-- ---------------------------------------------------------------------------
-- Settings helpers
-- ---------------------------------------------------------------------------
-- Effective mode. Anything but an explicit 'record_only' / 'live' is 'off'.
CREATE OR REPLACE FUNCTION public.order_notifications_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE (SELECT value ->> 'mode' FROM platform_settings WHERE key = 'order_notifications')
           WHEN 'record_only' THEN 'record_only'
           WHEN 'live' THEN 'live'
           ELSE 'off'
         END;
$$;
GRANT EXECUTE ON FUNCTION public.order_notifications_mode() TO authenticated, service_role;

-- Channels switched on in the settings (queued even in record_only, so the
-- record-only test shows exactly the rows a live run would send).
CREATE OR REPLACE FUNCTION public.order_notification_channels()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_remove(ARRAY[
           CASE WHEN (s.value -> 'sms' ->> 'enabled') = 'true' THEN 'sms' END,
           CASE WHEN (s.value -> 'whatsapp' ->> 'enabled') = 'true' THEN 'whatsapp' END
         ], NULL), ARRAY[]::text[])
  FROM (SELECT (SELECT value FROM platform_settings WHERE key = 'order_notifications') AS value) s;
$$;
REVOKE ALL ON FUNCTION public.order_notification_channels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_notification_channels() TO authenticated, service_role;

-- Queue one event on every enabled channel. Returns how many rows were added.
-- Internal: called by the trigger and the admin RPCs only.
CREATE OR REPLACE FUNCTION public.enqueue_order_notification(
  p_order_id uuid, p_event text, p_seq integer, p_created_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF public.order_notifications_mode() = 'off' THEN
    RETURN 0;
  END IF;
  INSERT INTO order_notifications (order_id, event, channel, seq, created_by)
  SELECT p_order_id, p_event, ch, p_seq, p_created_by
  FROM unnest(public.order_notification_channels()) AS ch
  ON CONFLICT ON CONSTRAINT order_notifications_once DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_order_notification(uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Order confirmation: the paid moment (same condition as notify_new_order's
-- callers: payment_status becomes 'completed').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_order_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'completed'
     OR (TG_OP = 'UPDATE' AND OLD.payment_status = 'completed') THEN
    RETURN NULL;
  END IF;
  -- Never let a notification problem touch the order.
  BEGIN
    IF coalesce(NEW.status::text, '') IN ('cancelled', 'returned')
       -- An admin marking an old order paid (Payment Recovery days later)
       -- shouldn't send a fresh "order confirmed" message.
       OR NEW.created_at < now() - interval '2 days' THEN
      RETURN NULL;
    END IF;
    PERFORM public.enqueue_order_notification(NEW.id, 'order_confirmed', 1, NULL);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'order confirmation not queued for order %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_order_confirmation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_order_notifications_trg ON public.orders;
-- No column list: also catches payment_status set by a BEFORE trigger.
-- Every other update exits on the first IF.
CREATE TRIGGER queue_order_notifications_trg
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.queue_order_confirmation();

-- ---------------------------------------------------------------------------
-- Admin: dispatch an order
-- ---------------------------------------------------------------------------
-- Cleans an admin-entered text field: no control characters, trimmed, NULL if empty.
CREATE OR REPLACE FUNCTION public.clean_admin_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), '');
$$;

-- 10-digit Indian mobile from +91 / 91 / 0 prefixed or spaced input, else NULL.
CREATE OR REPLACE FUNCTION public.normalize_indian_mobile(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN d ~ '^[6-9][0-9]{9}$' THEN d END
  FROM (SELECT CASE
                 WHEN length(x) = 12 AND left(x, 2) = '91' THEN right(x, 10)
                 WHEN length(x) = 11 AND left(x, 1) = '0' THEN right(x, 10)
                 ELSE x
               END AS d
        FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS x) a) b;
$$;

CREATE OR REPLACE FUNCTION public.admin_dispatch_order(
  p_order_id uuid,
  p_partner_type text,
  p_partner_name text,
  p_rider_name text,
  p_rider_phone text,
  p_dispatched_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_notify boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_phone text;
  v_partner_name text := left(public.clean_admin_text(p_partner_name), 60);
  v_rider_name text := left(public.clean_admin_text(p_rider_name), 60);
  v_notes text := left(public.clean_admin_text(p_notes), 500);
  v_first boolean;
  v_status_changed boolean := false;
  v_queued integer := 0;
BEGIN
  IF v_admin IS NULL OR NOT public.is_any_admin(v_admin) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_partner_type IS NULL OR p_partner_type NOT IN ('in_house', 'rapido', 'porter', 'other') THEN
    RAISE EXCEPTION 'Choose a delivery partner';
  END IF;
  IF p_partner_type = 'other' AND v_partner_name IS NULL THEN
    RAISE EXCEPTION 'Enter the delivery partner name';
  END IF;
  IF p_partner_type <> 'other' THEN
    v_partner_name := NULL;
  END IF;
  v_phone := public.normalize_indian_mobile(p_rider_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Enter a valid 10-digit mobile number for the delivery contact';
  END IF;
  IF p_dispatched_at IS NOT NULL AND p_dispatched_at > now() + interval '1 day' THEN
    RAISE EXCEPTION 'Dispatch time can''t be in the future';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.admin_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.payment_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Only paid orders can be dispatched';
  END IF;
  IF v_order.status::text IN ('cancelled', 'returned', 'return_initiated', 'return_in_transit') THEN
    RAISE EXCEPTION 'This order is % and can''t be dispatched', replace(v_order.status::text, '_', ' ');
  END IF;

  v_first := NOT EXISTS (SELECT 1 FROM order_dispatches WHERE order_id = p_order_id);

  INSERT INTO order_dispatches AS d (order_id, partner_type, partner_name, rider_name, rider_phone,
                                     dispatched_at, dispatched_by, updated_by, notes)
  VALUES (p_order_id, p_partner_type, v_partner_name, v_rider_name, v_phone,
          coalesce(p_dispatched_at, now()), v_admin, v_admin, v_notes)
  ON CONFLICT (order_id) DO UPDATE
    SET partner_type = EXCLUDED.partner_type,
        partner_name = EXCLUDED.partner_name,
        rider_name = EXCLUDED.rider_name,
        rider_phone = EXCLUDED.rider_phone,
        dispatched_at = coalesce(p_dispatched_at, d.dispatched_at),
        updated_by = v_admin,
        notes = EXCLUDED.notes,
        updated_at = now();

  -- Move forward to 'shipped' only; never backwards, never over
  -- out_for_delivery / delivered / undelivered.
  IF v_order.status::text IN ('pending', 'confirmed', 'processing') THEN
    UPDATE orders SET status = 'shipped' WHERE id = p_order_id;
    v_status_changed := true;
    INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, changed_by_type, notes, metadata)
    VALUES (p_order_id, v_order.status, 'shipped', v_admin, 'admin', 'Dispatched',
            jsonb_build_object('partner_type', p_partner_type));
  END IF;

  -- Only the first dispatch notifies automatically. Edits never do; sending
  -- again is the separate, deliberate Resend action.
  IF v_first AND coalesce(p_notify, true) THEN
    v_queued := public.enqueue_order_notification(p_order_id, 'order_dispatched', 1, v_admin);
  END IF;

  RETURN jsonb_build_object(
    'first_dispatch', v_first,
    'status_changed', v_status_changed,
    'notifications_queued', v_queued,
    'notifications_mode', public.order_notifications_mode());
END;
$$;
REVOKE ALL ON FUNCTION public.admin_dispatch_order(uuid, text, text, text, text, timestamptz, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dispatch_order(uuid, text, text, text, text, timestamptz, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: resend (also the manual retry for a failed / unknown message)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resend_order_notification(p_order_id uuid, p_event text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_order orders%ROWTYPE;
  v_ch text;
  v_seq integer;
  v_queued integer := 0;
BEGIN
  IF v_admin IS NULL OR NOT public.is_any_admin(v_admin) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_event NOT IN ('order_confirmed', 'order_dispatched') THEN
    RAISE EXCEPTION 'Unknown notification';
  END IF;
  IF public.order_notifications_mode() = 'off' THEN
    RAISE EXCEPTION 'Order notifications are switched off';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.admin_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.payment_status IS DISTINCT FROM 'completed'
     OR v_order.status::text IN ('cancelled', 'returned') THEN
    RAISE EXCEPTION 'Only paid, active orders can be notified';
  END IF;
  IF p_event = 'order_dispatched'
     AND NOT EXISTS (SELECT 1 FROM order_dispatches WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Dispatch the order first';
  END IF;

  FOREACH v_ch IN ARRAY public.order_notification_channels() LOOP
    -- One message in flight per order/event/channel: no double-click resends.
    IF EXISTS (SELECT 1 FROM order_notifications
               WHERE order_id = p_order_id AND event = p_event AND channel = v_ch
                 AND status IN ('queued', 'sending')) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM order_notifications
    WHERE order_id = p_order_id AND event = p_event AND channel = v_ch;
    INSERT INTO order_notifications (order_id, event, channel, seq, created_by)
    VALUES (p_order_id, p_event, v_ch, v_seq, v_admin)
    ON CONFLICT ON CONSTRAINT order_notifications_once DO NOTHING;
    IF FOUND THEN v_queued := v_queued + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('notifications_queued', v_queued, 'notifications_mode', public.order_notifications_mode());
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resend_order_notification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resend_order_notification(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Worker (service role only)
-- ---------------------------------------------------------------------------
-- Claims up to p_limit due rows and returns what the worker needs to send
-- them (the phone is read from the order now, never stored in the outbox).
-- Housekeeping first:
--   * a row stuck in 'sending' for 10+ minutes (worker died mid-call) becomes
--     'unknown', NOT resent: the provider may have accepted it;
--   * a row still queued after 24 hours (notifications were off/broken) is
--     skipped instead of sending a stale message.
CREATE OR REPLACE FUNCTION public.claim_order_notifications(p_limit integer DEFAULT 25)
RETURNS TABLE (
  id uuid, order_id uuid, event text, channel text, seq integer, attempts integer,
  order_number text, order_value numeric, order_status text, payment_status text,
  fulfillment_type text, address_phone text, profile_phone text,
  partner_type text, partner_name text, rider_name text, rider_phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  UPDATE order_notifications n
  SET status = 'unknown', locked_at = NULL, updated_at = now(),
      last_error = 'Sending was interrupted; it may or may not have been delivered. Use Resend if needed.'
  WHERE n.status = 'sending' AND n.locked_at < now() - interval '10 minutes';

  UPDATE order_notifications n
  SET status = 'skipped', updated_at = now(), last_error = 'Not sent: older than 24 hours when picked up'
  WHERE n.status = 'queued' AND n.created_at < now() - interval '24 hours';

  RETURN QUERY
  WITH due AS (
    SELECT n.id FROM order_notifications n
    WHERE n.status = 'queued' AND n.next_attempt_at <= now()
    ORDER BY n.next_attempt_at
    LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE order_notifications n
    SET status = 'sending', locked_at = now(), attempts = n.attempts + 1, updated_at = now()
    FROM due WHERE n.id = due.id
    RETURNING n.*
  )
  SELECT c.id, c.order_id, c.event, c.channel, c.seq, c.attempts,
         o.order_number::text,
         round(coalesce(o.total_amount, 0) + coalesce(o.wallet_amount_used, 0), 2),
         o.status::text, o.payment_status::text, o.fulfillment_type::text,
         o.shipping_address ->> 'phone', p.phone::text,
         d.partner_type, d.partner_name, d.rider_name, d.rider_phone
  FROM claimed c
  JOIN orders o ON o.id = c.order_id
  LEFT JOIN profiles p ON p.id = o.user_id
  LEFT JOIN order_dispatches d ON d.order_id = c.order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_order_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_notifications(integer) TO service_role;

-- Writes the outcome of one send. p_outcome: 'sent' | 'retry' | 'failed' | 'skipped' | 'unknown'.
-- 'retry' backs off 1, 5, 15, 60, 360 minutes and gives up after 6 attempts.
CREATE OR REPLACE FUNCTION public.complete_order_notification(
  p_id uuid, p_outcome text, p_provider_request_id text DEFAULT NULL,
  p_error text DEFAULT NULL, p_phone_last4 text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row order_notifications%ROWTYPE;
  v_status text;
  v_backoff integer[] := ARRAY[1, 5, 15, 60, 360];
BEGIN
  SELECT * INTO v_row FROM order_notifications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'sending' THEN
    RETURN NULL;  -- already finished (or rescued as unknown): never overwrite
  END IF;

  v_status := CASE p_outcome
                WHEN 'sent' THEN 'sent'
                WHEN 'skipped' THEN 'skipped'
                -- Timed out after the request left: it may have been delivered,
                -- so never retried automatically (no duplicate messages).
                WHEN 'unknown' THEN 'unknown'
                WHEN 'retry' THEN CASE WHEN v_row.attempts >= 6 THEN 'failed' ELSE 'queued' END
                ELSE 'failed'
              END;

  UPDATE order_notifications
  SET status = v_status,
      locked_at = NULL,
      next_attempt_at = CASE WHEN v_status = 'queued'
                             THEN now() + make_interval(mins => v_backoff[least(v_row.attempts, 5)])
                             ELSE next_attempt_at END,
      provider_request_id = coalesce(left(p_provider_request_id, 120), provider_request_id),
      last_error = CASE WHEN v_status = 'sent' THEN NULL ELSE left(p_error, 300) END,
      phone_last4 = CASE WHEN p_phone_last4 ~ '^[0-9]{4}$' THEN p_phone_last4 ELSE phone_last4 END,
      sent_at = CASE WHEN v_status = 'sent' THEN now() ELSE sent_at END,
      updated_at = now()
  WHERE id = p_id;
  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_order_notification(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_notification(uuid, text, text, text, text) TO service_role;

COMMIT;
