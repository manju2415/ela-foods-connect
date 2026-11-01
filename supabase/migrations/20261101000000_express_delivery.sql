-- Express Delivery: same-day delivery within a short time, for addresses
-- close to a store, while the store is open.
--
-- Settings live in the existing platform_settings 'shipping_settings' row,
-- under an "express" key (Admin -> Settings -> Shipping):
--   enabled          false until an admin switches it on (absent = off)
--   radius_km        max straight-line (Haversine) distance from the nearest store
--   fee              charged on top of the standard delivery charge
--   eta_minutes      delivery promise; the order must land before closing time
--   last_order_time  optional "HH:MM" IST cutoff
-- Store location and hours come from the stores table (Admin -> Stores):
-- the nearest active store that has coordinates is the dispatch store.
--
-- The customer's location is the confirmed map pin that checkout already
-- copies into the order's shipping_address (20261026000000). Checkout marks an
-- express order with shipping_address.delivery_type = 'express'; that key
-- reaches quote_checkout / place_paid_order / place_order_atomic unchanged,
-- so the Razorpay flow and edge functions need no change.
--
-- Additive: one nullable orders column (existing orders stay NULL = standard),
-- three new functions, and place_order_atomic gains an express branch. With
-- express off or not requested, place_order_atomic behaves exactly as before.

-- Refuse to replace place_order_atomic if the live copy is not the one this
-- migration was written against (or this migration's own version), and make
-- sure the quote and the paid order both price through it.
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_atomic'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_items jsonb, p_shipping_address jsonb, p_fulfillment_type text, p_pickup_store_id uuid, p_coupon_code text, p_use_wallet boolean, p_payment_method text, p_preferred_delivery_date date, p_preferred_delivery_slot_id uuid, p_idempotency_key text';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'place_order_atomic not found; express delivery migration not applied';
  END IF;
  IF md5(regexp_replace(v_src, '\s+', '', 'g')) NOT IN ('48a5847b3f0f626177c45242fb7c58c9', '97e95eac6e55a60ffbed538944aac9f9') THEN
    RAISE EXCEPTION 'place_order_atomic differs from 20261006000000_member_price_when_registration_off.sql; not replacing it';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'quote_checkout' AND p.prosrc ILIKE '%place_order_atomic(%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_paid_order' AND p.prosrc ILIKE '%place_order_atomic(%'
  ) THEN
    RAISE EXCEPTION 'quote_checkout / place_paid_order do not call place_order_atomic; express delivery migration not applied';
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_type_valid' AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_type_valid
      CHECK (delivery_type IS NULL OR delivery_type IN ('standard', 'express'));
  END IF;
END $$;

-- Only place_order_atomic (runs as the table owner), the service role and the
-- SQL editor may set delivery_type. Customers can update their own pending
-- orders and insert unpaid ones, and drivers can update assigned ones; the
-- existing restrict_* triggers reset a fixed list of columns, so this new
-- column is protected here. SECURITY INVOKER on purpose: current_user is the
-- API role for a direct write and the owner inside place_order_atomic.
CREATE OR REPLACE FUNCTION public.protect_order_delivery_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.delivery_type := NULL;
    ELSE
      NEW.delivery_type := OLD.delivery_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_order_delivery_type_trg ON public.orders;
CREATE TRIGGER protect_order_delivery_type_trg
BEFORE INSERT OR UPDATE OF delivery_type ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.protect_order_delivery_type();

-- Great-circle distance in km (Haversine, mean Earth radius 6371 km).
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE STRICT PARALLEL SAFE
AS $function$
  SELECT 2 * 6371 * asin(LEAST(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )));
$function$;

-- Server copy of src/lib/deliveryDays.ts isDeliverableOn: the most specific
-- override wins (category, then its parent, then a store-wide closure), then
-- the category's weekdays (falling back to its parent's).
CREATE OR REPLACE FUNCTION public.category_deliverable_on(p_category_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cat categories%ROWTYPE; v_available boolean; v_weekdays smallint[];
BEGIN
  IF p_category_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM categories WHERE id = p_category_id;
    SELECT is_available INTO v_available FROM delivery_date_overrides WHERE override_date = p_date AND category_id = p_category_id;
    IF FOUND THEN RETURN v_available; END IF;
    IF v_cat.parent_id IS NOT NULL THEN
      SELECT is_available INTO v_available FROM delivery_date_overrides WHERE override_date = p_date AND category_id = v_cat.parent_id;
      IF FOUND THEN RETURN v_available; END IF;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_date_overrides WHERE override_date = p_date AND category_id IS NULL AND NOT is_available) THEN
    RETURN false;
  END IF;
  v_weekdays := NULLIF(v_cat.delivery_weekdays, '{}'::smallint[]);
  IF v_weekdays IS NULL AND v_cat.parent_id IS NOT NULL THEN
    SELECT NULLIF(delivery_weekdays, '{}'::smallint[]) INTO v_weekdays FROM categories WHERE id = v_cat.parent_id;
  END IF;
  RETURN v_weekdays IS NULL OR extract(dow FROM p_date)::smallint = ANY (v_weekdays);
END;
$function$;

-- Whether an address can get Express Delivery right now. Used by checkout to
-- show the option and by place_order_atomic to enforce it. Times are IST.
CREATE OR REPLACE FUNCTION public.express_delivery_quote(p_latitude double precision, p_longitude double precision, p_product_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_express jsonb; v_radius numeric; v_fee numeric; v_eta integer; v_cutoff time;
  v_local timestamp := now() AT TIME ZONE 'Asia/Kolkata';
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_time time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
  v_store record; v_until time;
BEGIN
  SELECT value->'express' INTO v_express FROM platform_settings WHERE key = 'shipping_settings';
  IF NOT COALESCE((v_express->>'enabled')::boolean, false) THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'DISABLED', 'reason', 'Express Delivery is not offered right now.');
  END IF;
  v_radius := COALESCE((v_express->>'radius_km')::numeric, 10);
  v_fee := COALESCE((v_express->>'fee')::numeric, 49);
  v_eta := COALESCE((v_express->>'eta_minutes')::integer, 120);
  v_cutoff := NULLIF(v_express->>'last_order_time', '')::time;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'NO_LOCATION', 'fee', v_fee, 'eta_minutes', v_eta,
      'reason', 'Confirm your delivery location on the map to check Express Delivery.');
  END IF;

  SELECT s.id, s.name, s.opening_time, s.closing_time,
         public.haversine_km(p_latitude, p_longitude, s.latitude, s.longitude) AS distance_km
    INTO v_store
  FROM stores s
  WHERE s.is_active = true AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
  ORDER BY distance_km
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'NO_STORE', 'reason', 'Express Delivery is not available right now.');
  END IF;
  IF v_store.distance_km > v_radius THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'OUT_OF_RANGE', 'fee', v_fee, 'eta_minutes', v_eta,
      'distance_km', round(v_store.distance_km::numeric, 1), 'radius_km', v_radius,
      'reason', format('Express Delivery covers addresses within %s km of our store. Yours is %s km away.',
        trim_scale(v_radius), round(v_store.distance_km::numeric, 1)));
  END IF;

  -- Latest order time: early enough to deliver before closing, and not after
  -- the configured cutoff.
  IF v_store.closing_time IS NOT NULL THEN
    v_until := CASE WHEN v_store.closing_time >= time '00:00' + make_interval(mins => v_eta)
                    THEN v_store.closing_time - make_interval(mins => v_eta) END;
    IF v_until IS NULL THEN
      RETURN jsonb_build_object('eligible', false, 'code', 'CLOSED', 'reason', 'Express Delivery is not available today.');
    END IF;
  END IF;
  IF v_cutoff IS NOT NULL THEN v_until := LEAST(COALESCE(v_until, v_cutoff), v_cutoff); END IF;
  IF (v_store.opening_time IS NOT NULL AND v_time < v_store.opening_time)
     OR (v_until IS NOT NULL AND v_time > v_until) THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'CLOSED', 'fee', v_fee, 'eta_minutes', v_eta,
      'reason', CASE
        WHEN v_store.opening_time IS NOT NULL AND v_until IS NOT NULL THEN
          format('Express Delivery is available from %s to %s.',
            to_char(v_today + v_store.opening_time, 'FMHH12:MI AM'), to_char(v_today + v_until, 'FMHH12:MI AM'))
        WHEN v_until IS NOT NULL THEN format('Express Delivery is available until %s.', to_char(v_today + v_until, 'FMHH12:MI AM'))
        ELSE format('Express Delivery starts at %s.', to_char(v_today + v_store.opening_time, 'FMHH12:MI AM'))
      END);
  END IF;

  -- Today's delivery calendar (holidays, category weekdays), item by item as
  -- checkout does; an empty cart checks the store-wide calendar only.
  IF (cardinality(COALESCE(p_product_ids, '{}'::uuid[])) = 0 AND NOT public.category_deliverable_on(NULL, v_today))
     OR EXISTS (
       SELECT 1 FROM products p
       WHERE p.id = ANY (p_product_ids)
         AND NOT public.category_deliverable_on(p.category_id, v_today)
     ) THEN
    RETURN jsonb_build_object('eligible', false, 'code', 'NOT_TODAY', 'fee', v_fee, 'eta_minutes', v_eta,
      'reason', 'Some items in your cart can''t be delivered today.');
  END IF;

  RETURN jsonb_build_object(
    'eligible', true,
    'store_id', v_store.id,
    'store_name', v_store.name,
    'distance_km', round(v_store.distance_km::numeric, 1),
    'radius_km', v_radius,
    'fee', v_fee,
    'eta_minutes', v_eta,
    'delivery_date', v_today,
    'available_until', CASE WHEN v_until IS NOT NULL THEN to_char(v_until, 'HH24:MI') END,
    'checked_at', v_local
  );
END;
$function$;

-- place_order_atomic is unchanged from 20261006000000_member_price_when_registration_off.sql
-- except for the Express Delivery branch (marked "Express" below).
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
  v_is_member boolean; v_prior_orders integer; v_has_variant boolean; v_member_price boolean;
  v_is_express boolean := COALESCE(p_shipping_address->>'delivery_type', '') = 'express';
  v_express jsonb; v_delivery_date date := p_preferred_delivery_date; v_delivery_slot_id uuid := p_preferred_delivery_slot_id;
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
  -- Express: checked on the server for the quote and for wallet-only orders.
  -- A paid order (service role, keyed rzp:<payment_id>) was checked when it was
  -- quoted, so it is never turned away after the money has been taken.
  IF v_is_express THEN
    IF p_fulfillment_type <> 'delivery' THEN
      RETURN jsonb_build_object('success',false,'error','Express Delivery is only for home delivery.','code','EXPRESS_UNAVAILABLE');
    END IF;
    IF NOT (coalesce(v_claim_role, 'anon') = 'service_role' AND coalesce(p_idempotency_key, '') LIKE 'rzp:%') THEN
      v_express := public.express_delivery_quote(
        CASE WHEN jsonb_typeof(p_shipping_address->'latitude') = 'number' THEN (p_shipping_address->>'latitude')::double precision END,
        CASE WHEN jsonb_typeof(p_shipping_address->'longitude') = 'number' THEN (p_shipping_address->>'longitude')::double precision END,
        ARRAY(SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(p_items) x)
      );
      IF NOT COALESCE((v_express->>'eligible')::boolean, false) THEN
        RETURN jsonb_build_object('success',false,'error',v_express->>'reason','code','EXPRESS_UNAVAILABLE');
      END IF;
      v_delivery_date := (v_express->>'delivery_date')::date;
    END IF;
    v_delivery_slot_id := NULL;
  END IF;
  v_member_price := public.gets_member_price(p_user_id);
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
      v_price := CASE WHEN v_member_price THEN COALESCE(v_variant.member_price,v_variant.price) ELSE v_variant.price END;
      v_name := v_product.name || ' (' || v_variant.label || ')';
    ELSE
      v_price := CASE WHEN v_member_price THEN COALESCE(v_product.member_price,v_product.price) ELSE v_product.price END;
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
    -- Express: its fee on top of the standard delivery charge.
    IF v_is_express THEN v_shipping := v_shipping + COALESCE((v_shipping_settings->'express'->>'fee')::numeric,49); END IF;
  END IF;
  v_total := GREATEST(v_subtotal-v_discount+v_shipping,0);
  IF p_use_wallet AND v_total>0 THEN
    PERFORM ensure_user_wallet(p_user_id);
    SELECT COALESCE(purchase_only_balance,0),COALESCE(withdrawable_balance,0) INTO v_purchase,v_withdrawable FROM wallets WHERE user_id=p_user_id FOR UPDATE;
    v_use_purchase:=LEAST(v_purchase,v_total); v_use_withdrawable:=LEAST(v_withdrawable,v_total-v_use_purchase); v_wallet_used:=v_use_purchase+v_use_withdrawable;
    UPDATE wallets SET purchase_only_balance=purchase_only_balance-v_use_purchase,withdrawable_balance=withdrawable_balance-v_use_withdrawable,balance=balance-v_wallet_used,updated_at=now() WHERE user_id=p_user_id;
  END IF;
  v_total:=v_total-v_wallet_used; v_order_number:=generate_order_number();
  INSERT INTO orders(user_id,order_number,status,payment_status,subtotal,discount_amount,shipping_amount,total_amount,wallet_amount_used,shipping_address,coupon_code,preferred_delivery_date,preferred_delivery_slot_id,is_cod,cod_amount,fulfillment_type,pickup_store_id,idempotency_key,delivery_type)
  VALUES(p_user_id,v_order_number,'pending',CASE WHEN v_total=0 THEN 'completed'::payment_status ELSE 'pending'::payment_status END,v_subtotal,v_discount,v_shipping,v_total,v_wallet_used,p_shipping_address,CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.code ELSE NULL END,v_delivery_date,v_delivery_slot_id,false,0,p_fulfillment_type,p_pickup_store_id,p_idempotency_key,CASE WHEN v_is_express THEN 'express' END)
  RETURNING id INTO v_order_id;
  INSERT INTO order_items(order_id,product_id,product_name,product_price,quantity,total_price,variant_id,variant_label)
    SELECT v_order_id,(x->>'product_id')::uuid,x->>'product_name',(x->>'product_price')::numeric,(x->>'quantity')::integer,(x->>'total_price')::numeric,NULLIF(x->>'variant_id','')::uuid,x->>'variant_label' FROM jsonb_array_elements(v_order_items) x;
  IF v_wallet_used>0 THEN
    INSERT INTO wallet_transactions(wallet_id,type,amount,balance_after,description,reference_id,is_withdrawable)
    SELECT id,'purchase',v_wallet_used,balance,'Wallet payment for order '||v_order_number,v_order_id,v_use_withdrawable>0 FROM wallets WHERE user_id=p_user_id;
  END IF;
  IF v_coupon.id IS NOT NULL THEN UPDATE coupons SET usage_count=usage_count+1 WHERE id=v_coupon.id; END IF;
  RETURN jsonb_build_object('success',true,'order_id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'discount_amount',v_discount,'shipping_amount',v_shipping,'total_amount',v_total,'wallet_used',v_wallet_used,'is_cod',false,'delivery_type',CASE WHEN v_is_express THEN 'express' ELSE 'standard' END);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM,'code',CASE WHEN SQLERRM ILIKE '%stock%' OR SQLERRM ILIKE '%available%' THEN 'OUT_OF_STOCK' ELSE 'ORDER_FAILED' END);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.category_deliverable_on(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.category_deliverable_on(uuid, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.express_delivery_quote(double precision, double precision, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.express_delivery_quote(double precision, double precision, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.haversine_km(double precision, double precision, double precision, double precision) TO authenticated, service_role;
