CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  invoice_type text NOT NULL CHECK (invoice_type IN ('registration','order')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  registration_payment_id uuid REFERENCES public.founder_payment_logs(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method text,
  payment_reference text,
  payment_status text NOT NULL,
  taxable_amount numeric NOT NULL CHECK (taxable_amount >= 0),
  cgst_amount numeric NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount numeric NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount numeric NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  gst_amount numeric NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  shipping_amount numeric NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  wallet_amount numeric NOT NULL DEFAULT 0 CHECK (wallet_amount >= 0),
  total_amount numeric NOT NULL CHECK (total_amount >= 0),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_one_source CHECK (
    (invoice_type = 'registration' AND registration_payment_id IS NOT NULL AND order_id IS NULL)
    OR (invoice_type = 'order' AND order_id IS NOT NULL AND registration_payment_id IS NULL)
  ),
  UNIQUE (order_id),
  UNIQUE (registration_payment_id)
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own invoices" ON public.invoices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all invoices" ON public.invoices FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_idempotency_key_idx
  ON public.orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoice_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN CASE WHEN p_type = 'registration' THEN 'REG' ELSE 'INV' END
    || to_char(current_date, 'YYYYMMDD') || '-'
    || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_registration_invoice(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log founder_payment_logs%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_existing uuid;
  v_taxable numeric;
  v_gst numeric;
  v_invoice uuid;
BEGIN
  SELECT id INTO v_existing FROM invoices WHERE registration_payment_id = p_payment_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_log FROM founder_payment_logs WHERE id = p_payment_id;
  IF v_log.id IS NULL OR v_log.status <> 'success' THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM profiles WHERE id = v_log.user_id;
  v_taxable := round(v_log.amount / 1.18, 2);
  v_gst := v_log.amount - v_taxable;
  INSERT INTO invoices (
    invoice_number, invoice_type, user_id, registration_payment_id,
    customer_name, customer_email, customer_phone, payment_method,
    payment_reference, payment_status, taxable_amount, cgst_amount,
    sgst_amount, gst_amount, total_amount, items
  ) VALUES (
    next_invoice_number('registration'), 'registration', v_log.user_id, v_log.id,
    COALESCE(NULLIF(v_profile.full_name,''), 'Member'), NULLIF(v_profile.email,''), v_profile.phone,
    CASE WHEN v_log.notes ~ '\(([^)]+)\)' THEN substring(v_log.notes from '\(([^)]+)\)') ELSE 'online' END,
    v_log.payment_id, 'completed', v_taxable, round(v_gst / 2, 2),
    v_gst - round(v_gst / 2, 2), v_gst, v_log.amount,
    jsonb_build_array(jsonb_build_object('description','Membership registration fee','hsn_sac','999799','gst_rate',18,'quantity',1,'total',v_log.amount))
  ) RETURNING id INTO v_invoice;
  RETURN v_invoice;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_invoice FROM invoices WHERE registration_payment_id = p_payment_id;
  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_issue_registration_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'success' THEN PERFORM issue_registration_invoice(NEW.id); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS issue_registration_invoice_trg ON public.founder_payment_logs;
CREATE TRIGGER issue_registration_invoice_trg
AFTER INSERT OR UPDATE OF status ON public.founder_payment_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_issue_registration_invoice();

CREATE OR REPLACE FUNCTION public.issue_order_invoice(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_existing uuid;
  v_invoice uuid;
  v_items jsonb;
  v_taxable numeric;
  v_gst numeric;
BEGIN
  SELECT id INTO v_existing FROM invoices WHERE order_id = p_order_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;
  IF COALESCE(v_order.is_cod,false) = false AND v_order.payment_status <> 'completed' THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM profiles WHERE id = v_order.user_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', oi.product_id, 'variant_id', oi.variant_id, 'description', oi.product_name,
    'hsn_code', p.hsn_code, 'gst_rate', COALESCE(p.gst_percentage,0),
    'quantity', oi.quantity, 'unit_price', oi.product_price, 'total', oi.total_price
  ) ORDER BY oi.created_at), '[]'::jsonb)
  INTO v_items
  FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = p_order_id;
  SELECT COALESCE(sum(CASE WHEN COALESCE(p.gst_percentage,0) > 0 AND COALESCE(p.gst_inclusive,true)
    THEN oi.total_price / (1 + p.gst_percentage / 100) ELSE oi.total_price END),0),
    COALESCE(sum(CASE WHEN COALESCE(p.gst_percentage,0) > 0 AND COALESCE(p.gst_inclusive,true)
    THEN oi.total_price - oi.total_price / (1 + p.gst_percentage / 100)
    ELSE oi.total_price * COALESCE(p.gst_percentage,0) / 100 END),0)
  INTO v_taxable, v_gst
  FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = p_order_id;
  INSERT INTO invoices (
    invoice_number, invoice_type, user_id, order_id, customer_name, customer_email,
    customer_phone, billing_address, payment_method, payment_status, taxable_amount,
    cgst_amount, sgst_amount, gst_amount, discount_amount, shipping_amount,
    wallet_amount, total_amount, items
  ) VALUES (
    next_invoice_number('order'), 'order', v_order.user_id, v_order.id,
    COALESCE(v_order.shipping_address->>'full_name', NULLIF(v_profile.full_name,''), 'Customer'),
    COALESCE(v_order.shipping_address->>'email', NULLIF(v_profile.email,'')),
    COALESCE(v_order.shipping_address->>'phone', v_profile.phone), v_order.shipping_address,
    CASE WHEN COALESCE(v_order.is_cod,false) THEN 'cod' WHEN COALESCE(v_order.wallet_amount_used,0) >= COALESCE(v_order.subtotal,0) - COALESCE(v_order.discount_amount,0) + COALESCE(v_order.shipping_amount,0) THEN 'wallet' ELSE 'online' END,
    v_order.payment_status, round(v_taxable,2), round(v_gst/2,2), round(v_gst - round(v_gst/2,2),2),
    round(v_gst,2), COALESCE(v_order.discount_amount,0), COALESCE(v_order.shipping_amount,0),
    COALESCE(v_order.wallet_amount_used,0), COALESCE(v_order.total_amount,0) + COALESCE(v_order.wallet_amount_used,0), v_items
  ) RETURNING id INTO v_invoice;
  RETURN v_invoice;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_invoice FROM invoices WHERE order_id = p_order_id;
  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_issue_order_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(NEW.is_cod,false) OR NEW.payment_status = 'completed') AND NEW.status <> 'cancelled' THEN
    PERFORM issue_order_invoice(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS issue_order_invoice_trg ON public.orders;
CREATE CONSTRAINT TRIGGER issue_order_invoice_trg
AFTER INSERT OR UPDATE OF payment_status, is_cod ON public.orders
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_issue_order_invoice();

CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec record; v_message text;
BEGIN
  v_message := 'Order #' || NEW.order_number || ' · ₹' || round(COALESCE(NEW.total_amount,0) + COALESCE(NEW.wallet_amount_used,0),2)
    || ' · ' || NEW.fulfillment_type || ' · Payment: ' || NEW.payment_status;
  FOR v_rec IN
    SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role IN ('super_admin','admin')
    UNION
    SELECT DISTINCT ss.user_id FROM store_staff ss WHERE NEW.pickup_store_id IS NOT NULL AND ss.store_id = NEW.pickup_store_id
  LOOP
    INSERT INTO notifications(user_id,title,message,type,reference_type,reference_id)
    VALUES(v_rec.user_id,'New Order Received',v_message,'order','order',NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_new_order_trg ON public.orders;
CREATE TRIGGER notify_new_order_trg AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

CREATE OR REPLACE FUNCTION public.restore_cancelled_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_item record;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.stock_restored_at IS NULL THEN
    FOR v_item IN SELECT * FROM order_items WHERE order_id = NEW.id LOOP
      IF NEW.fulfillment_type = 'store_pickup' AND NEW.pickup_store_id IS NOT NULL THEN
        UPDATE store_inventory SET stock_quantity = COALESCE(stock_quantity,0) + v_item.quantity
          WHERE store_id = NEW.pickup_store_id AND product_id = v_item.product_id;
      ELSIF v_item.variant_id IS NOT NULL THEN
        UPDATE product_variants SET stock_quantity = stock_quantity + v_item.quantity WHERE id = v_item.variant_id;
      ELSE
        UPDATE products SET stock_quantity = stock_quantity + v_item.quantity WHERE id = v_item.product_id;
      END IF;
    END LOOP;
    NEW.stock_restored_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS restore_cancelled_order_stock_trg ON public.orders;
CREATE TRIGGER restore_cancelled_order_stock_trg BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restore_cancelled_order_stock();

CREATE OR REPLACE FUNCTION public.place_order_atomic(
  p_user_id uuid,
  p_items jsonb,
  p_shipping_address jsonb,
  p_fulfillment_type text DEFAULT 'delivery',
  p_pickup_store_id uuid DEFAULT NULL,
  p_coupon_code text DEFAULT NULL,
  p_use_wallet boolean DEFAULT false,
  p_payment_method text DEFAULT 'cod',
  p_preferred_delivery_date date DEFAULT NULL,
  p_preferred_delivery_slot_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_claim_role text := current_setting('request.jwt.claim.role',true);
  v_item jsonb; v_product products%ROWTYPE; v_variant product_variants%ROWTYPE;
  v_qty integer; v_price numeric; v_name text; v_subtotal numeric := 0;
  v_discount numeric := 0; v_shipping numeric := 0; v_total numeric; v_wallet_used numeric := 0;
  v_purchase numeric := 0; v_withdrawable numeric := 0; v_use_purchase numeric := 0; v_use_withdrawable numeric := 0;
  v_order_id uuid; v_order_number text; v_order_items jsonb := '[]'::jsonb; v_coupon coupons%ROWTYPE;
  v_shipping_settings jsonb; v_inventory integer; v_existing orders%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR (v_claim_role <> 'service_role' AND (v_uid IS NULL OR v_uid <> p_user_id)) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100 THEN
    RETURN jsonb_build_object('success',false,'error','Cart is empty or invalid');
  END IF;
  IF p_fulfillment_type NOT IN ('delivery','store_pickup') OR p_payment_method NOT IN ('cod','online') THEN
    RETURN jsonb_build_object('success',false,'error','Invalid fulfillment or payment method');
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
    v_qty := COALESCE((v_item->>'quantity')::integer,0);
    IF v_qty < 1 OR v_qty > 1000 THEN RETURN jsonb_build_object('success',false,'error','Invalid item quantity'); END IF;
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::uuid AND is_active=true FOR UPDATE;
    IF v_product.id IS NULL THEN RETURN jsonb_build_object('success',false,'error','A product is unavailable'); END IF;
    IF p_fulfillment_type='store_pickup' THEN
      SELECT stock_quantity INTO v_inventory FROM store_inventory WHERE store_id=p_pickup_store_id AND product_id=v_product.id FOR UPDATE;
      IF COALESCE(v_inventory,0) < v_qty THEN RETURN jsonb_build_object('success',false,'error',v_product.name || ' has only ' || COALESCE(v_inventory,0) || ' available','code','OUT_OF_STOCK'); END IF;
      UPDATE store_inventory SET stock_quantity=stock_quantity-v_qty WHERE store_id=p_pickup_store_id AND product_id=v_product.id;
    ELSIF NULLIF(v_item->>'variant_id','') IS NOT NULL THEN
      SELECT * INTO v_variant FROM product_variants WHERE id=(v_item->>'variant_id')::uuid AND product_id=v_product.id AND is_active=true FOR UPDATE;
      IF v_variant.id IS NULL OR v_variant.stock_quantity < v_qty THEN RETURN jsonb_build_object('success',false,'error',v_product.name || ' selected option is out of stock','code','OUT_OF_STOCK'); END IF;
      UPDATE product_variants SET stock_quantity=stock_quantity-v_qty WHERE id=v_variant.id;
    ELSE
      IF v_product.stock_quantity < v_qty THEN RETURN jsonb_build_object('success',false,'error',v_product.name || ' has only ' || v_product.stock_quantity || ' available','code','OUT_OF_STOCK'); END IF;
      UPDATE products SET stock_quantity=stock_quantity-v_qty WHERE id=v_product.id;
    END IF;
    IF NULLIF(v_item->>'variant_id','') IS NOT NULL THEN
      v_price := CASE WHEN public.has_role(p_user_id,'member') OR public.has_role(p_user_id,'founding_member') THEN COALESCE(v_variant.member_price,v_variant.price) ELSE v_variant.price END;
      v_name := v_product.name || ' (' || v_variant.label || ')';
    ELSE
      v_price := CASE WHEN public.has_role(p_user_id,'member') OR public.has_role(p_user_id,'founding_member') THEN COALESCE(v_product.member_price,v_product.price) ELSE v_product.price END;
      v_name := v_product.name;
    END IF;
    v_subtotal := v_subtotal + v_price*v_qty;
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'variant_id',NULLIF(v_item->>'variant_id','')::uuid,'variant_label',CASE WHEN v_variant.id IS NOT NULL THEN v_variant.label ELSE NULL END,'product_name',v_name,'product_price',v_price,'quantity',v_qty,'total_price',v_price*v_qty));
  END LOOP;
  IF p_coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM coupons WHERE upper(code)=upper(p_coupon_code) AND is_active=true AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) FOR UPDATE;
    IF v_coupon.id IS NULL OR v_subtotal < COALESCE(v_coupon.min_order_amount,0) OR (v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count>=v_coupon.usage_limit) THEN RAISE EXCEPTION USING MESSAGE='Invalid or expired coupon code'; END IF;
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
  VALUES(p_user_id,v_order_number,'pending',CASE WHEN v_total=0 THEN 'completed'::payment_status ELSE 'pending'::payment_status END,v_subtotal,v_discount,v_shipping,v_total,v_wallet_used,p_shipping_address,CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.code ELSE NULL END,p_preferred_delivery_date,p_preferred_delivery_slot_id,p_payment_method='cod' AND v_total>0,CASE WHEN p_payment_method='cod' THEN v_total ELSE 0 END,p_fulfillment_type,p_pickup_store_id,p_idempotency_key)
  RETURNING id INTO v_order_id;
  INSERT INTO order_items(order_id,product_id,product_name,product_price,quantity,total_price,variant_id,variant_label)
    SELECT v_order_id,(x->>'product_id')::uuid,x->>'product_name',(x->>'product_price')::numeric,(x->>'quantity')::integer,(x->>'total_price')::numeric,NULLIF(x->>'variant_id','')::uuid,x->>'variant_label' FROM jsonb_array_elements(v_order_items) x;
  IF v_wallet_used>0 THEN
    INSERT INTO wallet_transactions(wallet_id,type,amount,balance_after,description,reference_id,is_withdrawable)
    SELECT id,'purchase',v_wallet_used,balance,'Wallet payment for order '||v_order_number,v_order_id,v_use_withdrawable>0 FROM wallets WHERE user_id=p_user_id;
  END IF;
  IF v_coupon.id IS NOT NULL THEN UPDATE coupons SET usage_count=usage_count+1 WHERE id=v_coupon.id; END IF;
  RETURN jsonb_build_object('success',true,'order_id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'discount_amount',v_discount,'shipping_amount',v_shipping,'total_amount',v_total,'wallet_used',v_wallet_used,'is_cod',p_payment_method='cod' AND v_total>0);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM,'code',CASE WHEN SQLERRM ILIKE '%stock%' OR SQLERRM ILIKE '%available%' THEN 'OUT_OF_STOCK' ELSE 'ORDER_FAILED' END);
END;
$$;
GRANT EXECUTE ON FUNCTION public.place_order_atomic(uuid,jsonb,jsonb,text,uuid,text,boolean,text,date,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_record_registration_payment(p_user_id uuid, p_amount numeric, p_reference text DEFAULT NULL, p_method text DEFAULT 'manual', p_notes text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_admin uuid:=auth.uid(); v_existing numeric; v_is_founder boolean; v_log_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT public.is_any_admin(v_admin) THEN RETURN json_build_object('success',false,'error','Not authorized'); END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RETURN json_build_object('success',false,'error','Amount must be greater than zero'); END IF;
  IF p_reference IS NULL OR length(trim(p_reference))=0 THEN RETURN json_build_object('success',false,'error','Payment reference is required'); END IF;
  SELECT COALESCE(registration_fee_paid,0),COALESCE(is_designated_founder,false) INTO v_existing,v_is_founder FROM profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','Member not found'); END IF;
  IF EXISTS(SELECT 1 FROM founder_payment_logs WHERE payment_id=trim(p_reference) AND status='success') THEN RETURN json_build_object('success',false,'error','Payment reference is already recorded'); END IF;
  INSERT INTO founder_payment_logs(user_id,amount,payment_id,status,notes) VALUES(p_user_id,p_amount,trim(p_reference),'success',COALESCE(p_notes,'Recorded manually by admin ('||COALESCE(p_method,'manual')||')')) RETURNING id INTO v_log_id;
  PERFORM ensure_user_wallet(p_user_id);
  UPDATE profiles SET registration_fee_paid=GREATEST(COALESCE(registration_fee_paid,0),p_amount),user_level=CASE WHEN v_is_founder THEN 'founder'::user_level WHEN user_level='associate' THEN 'master'::user_level ELSE user_level END,founder_status=CASE WHEN v_is_founder THEN 'active' ELSE founder_status END,updated_at=now() WHERE id=p_user_id;
  INSERT INTO user_roles(user_id,role) VALUES(p_user_id,CASE WHEN v_is_founder THEN 'founding_member'::app_role ELSE 'member'::app_role END) ON CONFLICT(user_id,role) DO NOTHING;
  PERFORM credit_pending_referral_for_user(p_user_id);
  PERFORM generate_user_referral_code(p_user_id);
  PERFORM issue_registration_invoice(v_log_id);
  PERFORM create_notification(p_user_id,'Registration Payment Recorded','Your registration payment of ₹'||round(p_amount,2)||' has been recorded. Your membership is active and your GST invoice is available.','success','registration_payment',v_log_id);
  RETURN json_build_object('success',true,'invoice_id',issue_registration_invoice(v_log_id));
END;
$$;