-- Inventory is committed only after payment completes. The timestamp makes the
-- operation idempotent across Razorpay retries, reconciliation, and admin edits.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz;

-- Orders created before this migration already had their stock deducted by
-- place_order_atomic, so mark them to prevent a second deduction.
UPDATE public.orders
SET stock_deducted_at = COALESCE(created_at, now())
WHERE stock_deducted_at IS NULL;

CREATE OR REPLACE FUNCTION public.deduct_paid_order_stock(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item record;
  v_available integer;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL
     OR v_order.payment_status <> 'completed'
     OR v_order.status = 'cancelled'
     OR v_order.stock_deducted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- A paid guest order is inserted before its order_items. Do not mark it as
  -- processed until at least one item exists; the order_items trigger retries.
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id) THEN
    RETURN false;
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    IF v_order.fulfillment_type = 'store_pickup' AND v_order.pickup_store_id IS NOT NULL THEN
      SELECT stock_quantity INTO v_available
      FROM store_inventory
      WHERE store_id = v_order.pickup_store_id AND product_id = v_item.product_id
      FOR UPDATE;

      IF COALESCE(v_available, 0) < v_item.quantity THEN
        RAISE EXCEPTION '% has insufficient store stock', v_item.product_name;
      END IF;

      UPDATE store_inventory
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE store_id = v_order.pickup_store_id AND product_id = v_item.product_id;
    ELSIF v_item.variant_id IS NOT NULL THEN
      SELECT stock_quantity INTO v_available
      FROM product_variants WHERE id = v_item.variant_id FOR UPDATE;

      IF COALESCE(v_available, 0) < v_item.quantity THEN
        RAISE EXCEPTION '% has insufficient variant stock', v_item.product_name;
      END IF;

      UPDATE product_variants
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.variant_id;
    ELSE
      SELECT stock_quantity INTO v_available
      FROM products WHERE id = v_item.product_id FOR UPDATE;

      IF COALESCE(v_available, 0) < v_item.quantity THEN
        RAISE EXCEPTION '% has insufficient stock', v_item.product_name;
      END IF;

      UPDATE products
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET stock_deducted_at = now() WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_paid_order_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_paid_order_stock(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_deduct_paid_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'completed' AND NEW.status <> 'cancelled' THEN
    PERFORM deduct_paid_order_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deduct_paid_order_stock_trg ON public.orders;
CREATE TRIGGER deduct_paid_order_stock_trg
AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_deduct_paid_order_stock();

-- Preserve the existing atomic order validation/calculation, but release its
-- temporary stock reservation for unpaid orders. Paid/wallet-covered orders
-- keep the deduction and are marked as processed.
ALTER FUNCTION public.place_order_atomic(uuid,jsonb,jsonb,text,uuid,text,boolean,text,date,uuid,text)
  RENAME TO place_order_atomic_with_reservation;

CREATE FUNCTION public.place_order_atomic(
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
  v_result jsonb;
  v_order orders%ROWTYPE;
  v_item record;
BEGIN
  v_result := place_order_atomic_with_reservation(
    p_user_id, p_items, p_shipping_address, p_fulfillment_type,
    p_pickup_store_id, p_coupon_code, p_use_wallet, p_payment_method,
    p_preferred_delivery_date, p_preferred_delivery_slot_id, p_idempotency_key
  );

  IF COALESCE((v_result->>'success')::boolean, false) = false THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = (v_result->>'order_id')::uuid FOR UPDATE;

  IF v_order.payment_status = 'completed' THEN
    UPDATE orders SET stock_deducted_at = COALESCE(stock_deducted_at, now()) WHERE id = v_order.id;
  ELSIF v_order.stock_deducted_at IS NULL
        AND COALESCE((v_result->>'existing')::boolean, false) = false THEN
    -- The legacy atomic function just reserved this stock. Release it until
    -- payment completion; the paid-order trigger will deduct it exactly once.
    FOR v_item IN SELECT * FROM order_items WHERE order_id = v_order.id LOOP
      IF v_order.fulfillment_type = 'store_pickup' AND v_order.pickup_store_id IS NOT NULL THEN
        UPDATE store_inventory SET stock_quantity = stock_quantity + v_item.quantity
        WHERE store_id = v_order.pickup_store_id AND product_id = v_item.product_id;
      ELSIF v_item.variant_id IS NOT NULL THEN
        UPDATE product_variants SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.variant_id;
      ELSE
        UPDATE products SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.product_id;
      END IF;
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order_atomic(uuid,jsonb,jsonb,text,uuid,text,boolean,text,date,uuid,text)
TO authenticated, service_role;

-- Cancelled orders should only restore inventory that was actually deducted.
CREATE OR REPLACE FUNCTION public.restore_cancelled_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_item record;
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.stock_restored_at IS NULL
     AND OLD.stock_deducted_at IS NOT NULL THEN
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
    NEW.stock_deducted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
