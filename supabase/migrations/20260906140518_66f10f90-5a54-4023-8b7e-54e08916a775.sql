-- 20260906000000_restore_deduct_paid_order_stock.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_committed_at timestamptz;

CREATE OR REPLACE FUNCTION public.deduct_paid_order_stock(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.stock_committed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE orders SET stock_committed_at = now() WHERE id = p_order_id;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    IF v_order.fulfillment_type = 'store_pickup' AND v_order.pickup_store_id IS NOT NULL THEN
      UPDATE store_inventory
      SET stock_quantity = GREATEST(stock_quantity - v_item.quantity, 0)
      WHERE store_id = v_order.pickup_store_id AND product_id = v_item.product_id;
    ELSIF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_quantity = GREATEST(stock_quantity - v_item.quantity, 0)
      WHERE id = v_item.variant_id;
    ELSE
      UPDATE products
      SET stock_quantity = GREATEST(stock_quantity - v_item.quantity, 0)
      WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_paid_order_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_paid_order_stock(uuid) TO service_role;

-- 20260906010000_otp_send_log.sql
CREATE TABLE IF NOT EXISTS public.otp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'provider_error', 'invalid_response', 'internal_error')),
  provider_request_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_send_log_phone_created_idx
  ON public.otp_send_log (phone, created_at);

GRANT SELECT ON public.otp_send_log TO authenticated;
GRANT ALL ON public.otp_send_log TO service_role;

ALTER TABLE public.otp_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view otp send log" ON public.otp_send_log;
CREATE POLICY "Admins can view otp send log"
ON public.otp_send_log FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- 20260906020000_lock_down_wallet_rpcs.sql
REVOKE ALL ON FUNCTION public.add_wallet_transaction(uuid, numeric, wallet_transaction_type, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_purchase_commission(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_mlm_referral(text, uuid, numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id uuid,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_withdrawable_balance NUMERIC;
  v_profile RECORD;
  v_request_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  SELECT id, withdrawable_balance INTO v_wallet_id, v_withdrawable_balance
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_withdrawable_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient withdrawable balance');
  END IF;

  SELECT bank_name, bank_account_number, bank_ifsc, bank_account_holder
  INTO v_profile
  FROM profiles WHERE id = p_user_id;

  IF v_profile.bank_account_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Please add bank details first');
  END IF;

  INSERT INTO withdrawal_requests (
    user_id, amount, bank_name, bank_account_number, bank_ifsc, bank_account_holder
  ) VALUES (
    p_user_id, p_amount, v_profile.bank_name, v_profile.bank_account_number,
    v_profile.bank_ifsc, v_profile.bank_account_holder
  ) RETURNING id INTO v_request_id;

  UPDATE wallets SET
    withdrawable_balance = withdrawable_balance - p_amount,
    balance = balance - p_amount,
    updated_at = now()
  WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (
    wallet_id, type, amount, balance_after, description, is_withdrawable, reference_id
  ) VALUES (
    v_wallet_id, 'debit', p_amount,
    (SELECT balance FROM wallets WHERE id = v_wallet_id),
    'Withdrawal request - pending approval',
    true,
    v_request_id
  );

  RETURN json_build_object('success', true, 'request_id', v_request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric) TO authenticated;

DROP FUNCTION IF EXISTS public.process_withdrawal(uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_request_id uuid,
  p_status text,
  p_notes text DEFAULT NULL::text,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_payment_reference text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_wallet_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_any_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests WHERE id = p_request_id FOR UPDATE;

  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF p_status NOT IN ('approved','processing','paid','rejected') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid status');
  END IF;

  IF v_request.status IN ('paid','completed','rejected') THEN
    RETURN json_build_object('success', false, 'error', 'Request already finalised');
  END IF;

  IF p_status = 'rejected' AND v_request.status NOT IN ('pending','approved','processing') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reject this request');
  END IF;

  UPDATE withdrawal_requests SET
    status = p_status,
    notes = COALESCE(p_notes, notes),
    processed_by = auth.uid(),
    processed_at = now(),
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_method = COALESCE(p_payment_method, payment_method),
    paid_at = CASE WHEN p_status = 'paid' THEN COALESCE(p_paid_at, now()) ELSE paid_at END,
    updated_at = now()
  WHERE id = p_request_id;

  IF p_status = 'rejected' THEN
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_request.user_id FOR UPDATE;

    UPDATE wallets SET
      withdrawable_balance = withdrawable_balance + v_request.amount,
      balance = balance + v_request.amount,
      updated_at = now()
    WHERE id = v_wallet_id;

    INSERT INTO wallet_transactions (
      wallet_id, type, amount, balance_after, description, is_withdrawable, reference_id
    ) VALUES (
      v_wallet_id, 'credit', v_request.amount,
      (SELECT balance FROM wallets WHERE id = v_wallet_id),
      'Withdrawal request rejected - refunded', true, p_request_id
    );
  END IF;

  PERFORM create_notification(
    v_request.user_id,
    CASE p_status
      WHEN 'approved' THEN 'Withdrawal Approved'
      WHEN 'processing' THEN 'Withdrawal Processing'
      WHEN 'paid' THEN 'Withdrawal Paid'
      ELSE 'Withdrawal Rejected' END,
    CASE p_status
      WHEN 'approved' THEN 'Your withdrawal of ₹' || v_request.amount || ' has been approved.'
      WHEN 'processing' THEN 'Your withdrawal of ₹' || v_request.amount || ' is being processed.'
      WHEN 'paid' THEN 'Your withdrawal of ₹' || v_request.amount || ' has been paid'
           || CASE WHEN p_payment_reference IS NOT NULL THEN ' (Ref: ' || p_payment_reference || ')' ELSE '' END || '.'
      ELSE 'Your withdrawal request was rejected. Amount refunded to wallet.' END,
    'wallet', 'withdrawal', p_request_id
  );

  RETURN json_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.process_withdrawal(uuid, text, text, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(uuid, text, text, uuid, text, text, timestamptz) TO authenticated;

-- 20260906030000_lock_down_remaining_rpcs.sql
REVOKE ALL ON FUNCTION public.credit_founder_commission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_referral_incentive(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_invoice_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_order_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_registration_invoice(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_user_downline(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  user_level user_level,
  level_depth INTEGER,
  referred_by UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') <> 'service_role'
     AND (auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_any_admin(auth.uid()))) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH RECURSIVE downline AS (
    SELECT p.id as user_id, p.email, p.full_name, p.user_level, 1 as level_depth, p.referred_by
    FROM profiles p
    WHERE p.referred_by = p_user_id

    UNION ALL

    SELECT p.id, p.email, p.full_name, p.user_level, d.level_depth + 1, p.referred_by
    FROM profiles p
    INNER JOIN downline d ON p.referred_by = d.user_id
    WHERE d.level_depth < 10
  )
  SELECT * FROM downline ORDER BY level_depth, full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_downline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_downline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_user_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
  v_exists BOOLEAN;
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') <> 'service_role'
     AND (auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_any_admin(auth.uid()))) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS(SELECT 1 FROM referral_codes WHERE user_id = p_user_id AND is_active = true)
  INTO v_exists;

  IF v_exists THEN
    SELECT code INTO v_new_code FROM referral_codes WHERE user_id = p_user_id AND is_active = true LIMIT 1;
    RETURN v_new_code;
  END IF;

  LOOP
    v_new_code := generate_referral_code();
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_new_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  INSERT INTO referral_codes (user_id, code, is_active)
  VALUES (p_user_id, v_new_code, true);

  RETURN v_new_code;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_user_referral_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_user_referral_code(uuid) TO authenticated;

-- 20260906040000_protect_profile_privileged_fields.sql
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') = 'service_role' OR public.is_any_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  NEW.user_level := OLD.user_level;
  NEW.is_designated_founder := OLD.is_designated_founder;
  NEW.founder_status := OLD.founder_status;
  NEW.registration_fee_paid := OLD.registration_fee_paid;
  NEW.referred_by := OLD.referred_by;
  NEW.referral_count := OLD.referral_count;
  NEW.is_active := OLD.is_active;
  NEW.admin_deleted_at := OLD.admin_deleted_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

-- 20260906050000_harden_order_insert_policies.sql
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE(wallet_amount_used, 0) = 0
    AND payment_status = 'pending'
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Users can create their own order items" ON public.order_items;
CREATE POLICY "Users can create their own order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_id
        AND o.user_id = auth.uid()
        AND o.status = 'pending'
        AND o.payment_status = 'pending'
    )
  );

-- 20260906060000_customer_order_cancel_and_driver_columns.sql
DROP POLICY IF EXISTS "Users can cancel their own pending orders" ON public.orders;
CREATE POLICY "Users can cancel their own pending orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.restrict_customer_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') = 'service_role' OR public.is_any_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    NEW.payment_status := 'failed';
  ELSE
    NEW.status := OLD.status;
    NEW.payment_status := OLD.payment_status;
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.order_number := OLD.order_number;
  NEW.subtotal := OLD.subtotal;
  NEW.discount_amount := OLD.discount_amount;
  NEW.shipping_amount := OLD.shipping_amount;
  NEW.total_amount := OLD.total_amount;
  NEW.wallet_amount_used := OLD.wallet_amount_used;
  NEW.is_cod := OLD.is_cod;
  NEW.cod_amount := OLD.cod_amount;
  NEW.coupon_code := OLD.coupon_code;
  NEW.stock_restored_at := OLD.stock_restored_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restrict_customer_order_cancel_trg ON public.orders;
CREATE TRIGGER restrict_customer_order_cancel_trg
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restrict_customer_order_cancel();

CREATE OR REPLACE FUNCTION public.restrict_driver_order_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') = 'service_role' OR public.is_any_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_order_assigned_to_partner(OLD.id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered') THEN
    NEW.status := OLD.status;
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.order_number := OLD.order_number;
  NEW.subtotal := OLD.subtotal;
  NEW.discount_amount := OLD.discount_amount;
  NEW.shipping_amount := OLD.shipping_amount;
  NEW.total_amount := OLD.total_amount;
  NEW.wallet_amount_used := OLD.wallet_amount_used;
  NEW.coupon_code := OLD.coupon_code;
  NEW.stock_restored_at := OLD.stock_restored_at;
  NEW.payment_status := CASE
    WHEN OLD.is_cod AND NEW.status = 'delivered' THEN 'completed'::payment_status
    ELSE OLD.payment_status
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restrict_driver_order_columns_trg ON public.orders;
CREATE TRIGGER restrict_driver_order_columns_trg
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restrict_driver_order_columns();

-- 20260906070000_fix_place_order_atomic_loop_bugs.sql
CREATE OR REPLACE FUNCTION public.place_order_atomic(p_user_id uuid, p_items jsonb, p_shipping_address jsonb, p_fulfillment_type text DEFAULT 'delivery'::text, p_pickup_store_id uuid DEFAULT NULL::uuid, p_coupon_code text DEFAULT NULL::text, p_use_wallet boolean DEFAULT false, p_payment_method text DEFAULT 'online'::text, p_preferred_delivery_date date DEFAULT NULL::date, p_preferred_delivery_slot_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_item jsonb; v_product products%ROWTYPE; v_variant product_variants%ROWTYPE;
  v_qty integer; v_price numeric; v_name text; v_subtotal numeric := 0;
  v_discount numeric := 0; v_shipping numeric := 0; v_total numeric; v_wallet_used numeric := 0;
  v_purchase numeric := 0; v_withdrawable numeric := 0; v_use_purchase numeric := 0; v_use_withdrawable numeric := 0;
  v_order_id uuid; v_order_number text; v_order_items jsonb := '[]'::jsonb; v_coupon coupons%ROWTYPE;
  v_shipping_settings jsonb; v_inventory integer; v_existing orders%ROWTYPE;
  v_is_member boolean; v_prior_orders integer; v_has_variant boolean;
BEGIN
  IF p_user_id IS NULL OR (coalesce(v_claim_role, 'anon') <> 'service_role' AND (v_uid IS NULL OR v_uid <> p_user_id)) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100 THEN
    RETURN jsonb_build_object('success',false,'error','Cart is empty or invalid');
  END IF;
  IF p_fulfillment_type NOT IN ('delivery','store_pickup') THEN
    RETURN jsonb_build_object('success',false,'error','Invalid fulfillment method');
  END IF;
  IF p_payment_method IS NOT NULL AND p_payment_method <> 'online' THEN
    RETURN jsonb_build_object('success',false,'error','Cash on delivery is no longer available. Please pay online or use wallet credit.','code','COD_DISABLED');
  END IF;
  IF p_fulfillment_type = 'store_pickup' AND p_pickup_store_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','Pickup store is required');
  END IF;
  IF p_fulfillment_type = 'delivery' AND COALESCE(p_shipping_address->>'address_line1','') = '' THEN
    RETURN jsonb_build_object('success',false,'error','Delivery address is required');
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM orders WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
    IF v_existing.id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'order_id',v_existing.id,'order_number',v_existing.order_number,'total_amount',v_existing.total_amount,'wallet_used',v_existing.wallet_amount_used,'existing',true); END IF;
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_variant := NULL;
    v_has_variant := NULLIF(v_item->>'variant_id','') IS NOT NULL;
    v_qty := COALESCE((v_item->>'quantity')::integer,0);
    IF v_qty < 1 OR v_qty > 1000 THEN RAISE EXCEPTION USING MESSAGE='Invalid item quantity'; END IF;
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::uuid AND is_active=true FOR UPDATE;
    IF v_product.id IS NULL THEN RAISE EXCEPTION USING MESSAGE='A product is unavailable'; END IF;
    IF v_has_variant THEN
      SELECT * INTO v_variant FROM product_variants WHERE id=(v_item->>'variant_id')::uuid AND product_id=v_product.id AND is_active=true FOR UPDATE;
      IF v_variant.id IS NULL THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' selected option is unavailable'; END IF;
    END IF;
    IF p_fulfillment_type='store_pickup' THEN
      SELECT stock_quantity INTO v_inventory FROM store_inventory WHERE store_id=p_pickup_store_id AND product_id=v_product.id FOR UPDATE;
      IF COALESCE(v_inventory,0) < v_qty THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' has only ' || COALESCE(v_inventory,0) || ' available'; END IF;
      UPDATE store_inventory SET stock_quantity=stock_quantity-v_qty WHERE store_id=p_pickup_store_id AND product_id=v_product.id;
    ELSIF v_has_variant THEN
      IF v_variant.stock_quantity < v_qty THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' selected option is out of stock'; END IF;
      UPDATE product_variants SET stock_quantity=stock_quantity-v_qty WHERE id=v_variant.id;
    ELSE
      IF v_product.stock_quantity < v_qty THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' has only ' || v_product.stock_quantity || ' available'; END IF;
      UPDATE products SET stock_quantity=stock_quantity-v_qty WHERE id=v_product.id;
    END IF;
    IF v_has_variant THEN
      v_price := CASE WHEN public.has_role(p_user_id,'member') OR public.has_role(p_user_id,'founding_member') THEN COALESCE(v_variant.member_price,v_variant.price) ELSE v_variant.price END;
      v_name := v_product.name || ' (' || v_variant.label || ')';
    ELSE
      v_price := CASE WHEN public.has_role(p_user_id,'member') OR public.has_role(p_user_id,'founding_member') THEN COALESCE(v_product.member_price,v_product.price) ELSE v_product.price END;
      v_name := v_product.name;
    END IF;
    v_subtotal := v_subtotal + v_price*v_qty;
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'variant_id',NULLIF(v_item->>'variant_id','')::uuid,'variant_label',CASE WHEN v_has_variant THEN v_variant.label ELSE NULL END,'product_name',v_name,'product_price',v_price,'quantity',v_qty,'total_price',v_price*v_qty));
  END LOOP;
  IF p_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons WHERE upper(code)=upper(p_coupon_code) AND is_active=true AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) FOR UPDATE;
    IF v_coupon.id IS NULL OR v_subtotal < COALESCE(v_coupon.min_order_amount,0) OR (v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count>=v_coupon.usage_limit) THEN RAISE EXCEPTION USING MESSAGE='Invalid or expired coupon code'; END IF;
    v_is_member := public.has_role(p_user_id,'member') OR public.has_role(p_user_id,'founding_member');
    IF v_coupon.audience = 'members' AND NOT v_is_member THEN RAISE EXCEPTION USING MESSAGE='This coupon is only for members'; END IF;
    IF v_coupon.audience = 'non_members' AND v_is_member THEN RAISE EXCEPTION USING MESSAGE='This coupon is only for non-member customers'; END IF;
    IF v_coupon.first_order_only THEN
      SELECT count(*) INTO v_prior_orders FROM orders WHERE user_id=p_user_id AND status <> 'cancelled';
      IF COALESCE(v_prior_orders,0) > 0 THEN RAISE EXCEPTION USING MESSAGE='This coupon is valid on your first order only'; END IF;
    END IF;
    v_discount := CASE WHEN v_coupon.discount_type='percentage' THEN v_subtotal*v_coupon.discount_value/100 ELSE v_coupon.discount_value END;
    v_discount := LEAST(v_subtotal,v_discount,COALESCE(v_coupon.max_discount_amount,v_discount));
  END IF;
  IF p_fulfillment_type='delivery' THEN
    SELECT value INTO v_shipping_settings FROM platform_settings WHERE key='shipping_settings';
    IF COALESCE((v_shipping_settings->>'enable_free_shipping')::boolean,true) AND v_subtotal>=COALESCE((v_shipping_settings->>'free_shipping_threshold')::numeric,500) THEN v_shipping:=0; ELSE v_shipping:=COALESCE((v_shipping_settings->>'flat_rate')::numeric,50); END IF;
  END IF;
  v_total := GREATEST(v_subtotal-v_discount+v_shipping,0);
  IF p_use_wallet AND v_total>0 THEN
    PERFORM ensure_user_wallet(p_user_id);
    SELECT COALESCE(purchase_only_balance,0),COALESCE(withdrawable_balance,0) INTO v_purchase,v_withdrawable FROM wallets WHERE user_id=p_user_id FOR UPDATE;
    v_use_purchase:=LEAST(v_purchase,v_total); v_use_withdrawable:=LEAST(v_withdrawable,v_total-v_use_purchase); v_wallet_used:=v_use_purchase+v_use_withdrawable;
    UPDATE wallets SET purchase_only_balance=purchase_only_balance-v_use_purchase,withdrawable_balance=withdrawable_balance-v_use_withdrawable,balance=balance-v_wallet_used,updated_at=now() WHERE user_id=p_user_id;
  END IF;
  v_total:=v_total-v_wallet_used; v_order_number:=generate_order_number();
  INSERT INTO orders(user_id,order_number,status,payment_status,subtotal,discount_amount,shipping_amount,total_amount,wallet_amount_used,shipping_address,coupon_code,preferred_delivery_date,preferred_delivery_slot_id,is_cod,cod_amount,fulfillment_type,pickup_store_id,idempotency_key)
  VALUES(p_user_id,v_order_number,'pending',CASE WHEN v_total=0 THEN 'completed'::payment_status ELSE 'pending'::payment_status END,v_subtotal,v_discount,v_shipping,v_total,v_wallet_used,p_shipping_address,CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.code ELSE NULL END,p_preferred_delivery_date,p_preferred_delivery_slot_id,false,0,p_fulfillment_type,p_pickup_store_id,p_idempotency_key)
  RETURNING id INTO v_order_id;
  INSERT INTO order_items(order_id,product_id,product_name,product_price,quantity,total_price,variant_id,variant_label)
    SELECT v_order_id,(x->>'product_id')::uuid,x->>'product_name',(x->>'product_price')::numeric,(x->>'quantity')::integer,(x->>'total_price')::numeric,NULLIF(x->>'variant_id','')::uuid,x->>'variant_label' FROM jsonb_array_elements(v_order_items) x;
  IF v_wallet_used>0 THEN
    INSERT INTO wallet_transactions(wallet_id,type,amount,balance_after,description,reference_id,is_withdrawable)
    SELECT id,'purchase',v_wallet_used,balance,'Wallet payment for order '||v_order_number,v_order_id,v_use_withdrawable>0 FROM wallets WHERE user_id=p_user_id;
  END IF;
  IF v_coupon.id IS NOT NULL THEN UPDATE coupons SET usage_count=usage_count+1 WHERE id=v_coupon.id; END IF;
  RETURN jsonb_build_object('success',true,'order_id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'discount_amount',v_discount,'shipping_amount',v_shipping,'total_amount',v_total,'wallet_used',v_wallet_used,'is_cod',false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM,'code',CASE WHEN SQLERRM ILIKE '%stock%' OR SQLERRM ILIKE '%available%' THEN 'OUT_OF_STOCK' ELSE 'ORDER_FAILED' END);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.place_order_atomic(uuid,jsonb,jsonb,text,uuid,text,boolean,text,date,uuid,text)
TO authenticated, service_role;

-- 20260906080000_wallet_reference_id_to_text.sql
ALTER TABLE public.wallet_transactions ALTER COLUMN reference_id TYPE text USING reference_id::text;

-- 20260906090000_order_confirmation_email_sent_at.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;