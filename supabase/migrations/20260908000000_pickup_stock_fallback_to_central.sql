-- store_inventory (per-store pickup stock) is an admin-managed pool kept
-- separate from each product's central stock_quantity. In practice it has
-- almost never been populated (a single leftover row across 92 products and
-- 1 store), so place_order_atomic's store_pickup branch — which treats a
-- missing store_inventory row as zero stock via COALESCE(v_inventory,0) —
-- has been rejecting store-pickup orders for nearly every product even
-- though the product has plenty of central stock. Once an admin does
-- explicitly set a store's stock for a product, that explicit row is still
-- authoritative and used as before; this only changes behaviour when no
-- such row exists yet, falling back to central stock (product or variant,
-- matching the delivery branches below) so pickup isn't silently
-- unpurchasable by default. No other part of this function changes from
-- the version in 20260906140518_66f10f90-5a54-4023-8b7e-54e08916a775.sql.
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
      IF v_inventory IS NULL THEN
        -- No store-specific stock has ever been recorded for this product at
        -- this store; fall back to the central pool (variant-aware, same as
        -- the delivery branches below) rather than treating an absent row
        -- as zero stock.
        IF v_has_variant THEN
          IF v_variant.stock_quantity < v_qty THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' selected option is out of stock'; END IF;
          UPDATE product_variants SET stock_quantity=stock_quantity-v_qty WHERE id=v_variant.id;
        ELSE
          IF v_product.stock_quantity < v_qty THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' has only ' || v_product.stock_quantity || ' available'; END IF;
          UPDATE products SET stock_quantity=stock_quantity-v_qty WHERE id=v_product.id;
        END IF;
      ELSE
        IF v_inventory < v_qty THEN RAISE EXCEPTION USING MESSAGE=v_product.name || ' has only ' || v_inventory || ' available'; END IF;
        UPDATE store_inventory SET stock_quantity=stock_quantity-v_qty WHERE store_id=p_pickup_store_id AND product_id=v_product.id;
      END IF;
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
