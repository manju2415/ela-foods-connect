ALTER TABLE public.payment_attempts ADD COLUMN IF NOT EXISTS checkout_payload jsonb;
ALTER TABLE public.payment_attempts ADD COLUMN IF NOT EXISTS expected_amount numeric;

-- Read-only price check: runs the real order routine inside a savepoint and
-- rolls it back, so the quote can never drift from what order creation charges.
CREATE OR REPLACE FUNCTION public.quote_checkout(p_user_id uuid, p_items jsonb, p_shipping_address jsonb, p_fulfillment_type text DEFAULT 'delivery', p_pickup_store_id uuid DEFAULT NULL, p_coupon_code text DEFAULT NULL, p_use_wallet boolean DEFAULT false, p_preferred_delivery_date date DEFAULT NULL, p_preferred_delivery_slot_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    v_result := public.place_order_atomic(p_user_id, p_items, p_shipping_address, p_fulfillment_type, p_pickup_store_id, p_coupon_code, p_use_wallet, 'online', p_preferred_delivery_date, p_preferred_delivery_slot_id, NULL);
    RAISE EXCEPTION 'QUOTE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'QUOTE_ROLLBACK' THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
    END IF;
  END;
  RETURN v_result - 'order_id' - 'order_number';
END; $$;
REVOKE ALL ON FUNCTION public.quote_checkout(uuid, jsonb, jsonb, text, uuid, text, boolean, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_checkout(uuid, jsonb, jsonb, text, uuid, text, boolean, date, uuid) TO service_role;

-- Creates the order only after a verified Razorpay payment, exactly once per payment.
CREATE OR REPLACE FUNCTION public.place_paid_order(p_payment_id text, p_captured_amount numeric, p_user_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_key text := 'rzp:' || p_payment_id; v_existing orders%ROWTYPE; v_result jsonb; v_err text;
BEGIN
  IF p_payment_id IS NULL OR p_user_id IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing payment or checkout details');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_key));
  SELECT * INTO v_existing FROM orders WHERE user_id = p_user_id AND idempotency_key = v_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'existing', true, 'order_id', v_existing.id, 'order_number', v_existing.order_number);
  END IF;
  BEGIN
    v_result := public.place_order_atomic(p_user_id, p_payload->'items', COALESCE(p_payload->'shipping_address', '{}'::jsonb),
      COALESCE(p_payload->>'fulfillment_type', 'delivery'), NULLIF(p_payload->>'pickup_store_id', '')::uuid,
      NULLIF(p_payload->>'coupon_code', ''), COALESCE((p_payload->>'use_wallet')::boolean, false), 'online',
      NULLIF(p_payload->>'preferred_delivery_date', '')::date, NULLIF(p_payload->>'preferred_delivery_slot_id', '')::uuid, v_key);
    IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_result->>'error', 'Order could not be created');
    END IF;
    IF round(p_captured_amount * 100) < round((v_result->>'total_amount')::numeric * 100) THEN
      RAISE EXCEPTION 'Paid amount (%) is less than the amount due (%)', p_captured_amount, v_result->>'total_amount';
    END IF;
    UPDATE orders SET payment_status = 'completed', is_cod = false WHERE id = (v_result->>'order_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', v_err);
  END;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.place_paid_order(text, numeric, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_paid_order(text, numeric, uuid, jsonb) TO service_role;