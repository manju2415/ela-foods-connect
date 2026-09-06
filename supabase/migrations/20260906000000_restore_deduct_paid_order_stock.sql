-- `place-guest-order` and `reconcile-payment-attempt` both call
-- public.deduct_paid_order_stock(p_order_id) to commit inventory after an
-- already-verified payment. The function was only ever defined in a
-- migration (20260902000000) that was written but never applied to this
-- database, so every guest checkout and every payment recovery has been
-- failing at this step with "function not found", returning an error to a
-- customer who was already charged, with stock never decremented.
--
-- This replaces that missing piece with a minimal, non-blocking version.
-- Unlike the abandoned migration, it does not raise on insufficient stock
-- (payment is already captured at this point, so refusing to finish the
-- order helps no one) and it does not touch place_order_atomic or add a
-- stock_deducted_at column/trigger, so it cannot re-create the double-
-- deduction risk that came from the old reservation/trigger design.
--
-- stock_committed_at guards against a second call for the same order (a
-- retried edge-function invocation) deducting the same items twice — the
-- earlier version of this function had no such guard.
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
