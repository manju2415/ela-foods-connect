ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS legacy_invoice_number text;

CREATE SEQUENCE IF NOT EXISTS public.invoice_reg_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_sales_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'registration' THEN
    RETURN 'R' || lpad(nextval('public.invoice_reg_number_seq')::text, 3, '0');
  END IF;
  RETURN 'S' || lpad(nextval('public.invoice_sales_number_seq')::text, 3, '0');
END;
$$;

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
  v_state text;
  v_interstate boolean;
BEGIN
  SELECT id INTO v_existing FROM invoices WHERE order_id = p_order_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;
  IF COALESCE(v_order.is_cod,false) = false AND v_order.payment_status <> 'completed' THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM profiles WHERE id = v_order.user_id;

  v_state := NULLIF(trim(v_order.shipping_address->>'state'), '');
  v_interstate := v_state IS NOT NULL AND v_state NOT ILIKE '%karnataka%';

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
    cgst_amount, sgst_amount, igst_amount, gst_amount, discount_amount, shipping_amount,
    wallet_amount, total_amount, items
  ) VALUES (
    next_invoice_number('order'), 'order', v_order.user_id, v_order.id,
    COALESCE(v_order.shipping_address->>'full_name', NULLIF(v_profile.full_name,''), 'Customer'),
    COALESCE(v_order.shipping_address->>'email', NULLIF(v_profile.email,'')),
    COALESCE(v_order.shipping_address->>'phone', v_profile.phone), v_order.shipping_address,
    CASE WHEN COALESCE(v_order.is_cod,false) THEN 'cod' WHEN COALESCE(v_order.wallet_amount_used,0) >= COALESCE(v_order.subtotal,0) - COALESCE(v_order.discount_amount,0) + COALESCE(v_order.shipping_amount,0) THEN 'wallet' ELSE 'online' END,
    v_order.payment_status, round(v_taxable,2),
    CASE WHEN v_interstate THEN 0 ELSE round(v_gst/2,2) END,
    CASE WHEN v_interstate THEN 0 ELSE round(v_gst - round(v_gst/2,2),2) END,
    CASE WHEN v_interstate THEN round(v_gst,2) ELSE 0 END,
    round(v_gst,2), COALESCE(v_order.discount_amount,0), COALESCE(v_order.shipping_amount,0),
    COALESCE(v_order.wallet_amount_used,0), COALESCE(v_order.total_amount,0) + COALESCE(v_order.wallet_amount_used,0), v_items
  ) RETURNING id INTO v_invoice;
  RETURN v_invoice;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_invoice FROM invoices WHERE order_id = p_order_id;
  RETURN v_invoice;
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
  v_address jsonb;
  v_state text;
  v_interstate boolean;
BEGIN
  SELECT id INTO v_existing FROM invoices WHERE registration_payment_id = p_payment_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_log FROM founder_payment_logs WHERE id = p_payment_id;
  IF v_log.id IS NULL OR v_log.status <> 'success' THEN RETURN NULL; END IF;
  SELECT * INTO v_profile FROM profiles WHERE id = v_log.user_id;

  SELECT jsonb_build_object(
    'full_name', a.full_name, 'phone', a.phone, 'address_line1', a.address_line1,
    'address_line2', a.address_line2, 'city', a.city, 'state', a.state,
    'postal_code', a.postal_code
  ) INTO v_address
  FROM addresses a
  WHERE a.user_id = v_log.user_id
  ORDER BY a.is_default DESC NULLS LAST, a.created_at
  LIMIT 1;

  v_state := NULLIF(trim(v_address->>'state'), '');
  v_interstate := v_state IS NOT NULL AND v_state NOT ILIKE '%karnataka%';

  v_taxable := round(v_log.amount / 1.18, 2);
  v_gst := v_log.amount - v_taxable;

  INSERT INTO invoices (
    invoice_number, invoice_type, user_id, registration_payment_id,
    customer_name, customer_email, customer_phone, billing_address, payment_method,
    payment_reference, payment_status, taxable_amount, cgst_amount,
    sgst_amount, igst_amount, gst_amount, total_amount, items
  ) VALUES (
    next_invoice_number('registration'), 'registration', v_log.user_id, v_log.id,
    COALESCE(NULLIF(v_profile.full_name,''), 'Member'), NULLIF(v_profile.email,''), v_profile.phone,
    COALESCE(v_address, '{}'::jsonb),
    CASE WHEN v_log.notes ~ '\(([^)]+)\)' THEN substring(v_log.notes from '\(([^)]+)\)') ELSE 'online' END,
    v_log.payment_id, 'completed', v_taxable,
    CASE WHEN v_interstate THEN 0 ELSE round(v_gst / 2, 2) END,
    CASE WHEN v_interstate THEN 0 ELSE v_gst - round(v_gst / 2, 2) END,
    CASE WHEN v_interstate THEN v_gst ELSE 0 END,
    v_gst, v_log.amount,
    jsonb_build_array(jsonb_build_object('description','User Registration Charge','hsn_sac','9983','gst_rate',18,'quantity',1,'total',v_log.amount))
  ) RETURNING id INTO v_invoice;
  RETURN v_invoice;
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_invoice FROM invoices WHERE registration_payment_id = p_payment_id;
  RETURN v_invoice;
END;
$$;