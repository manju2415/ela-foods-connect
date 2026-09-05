-- The admin inventory editor wrote an absolute stock_quantity captured in a
-- stale page snapshot, so a concurrent checkout's atomic decrement could be
-- silently clobbered by the admin's save, resurrecting stock that was
-- already sold. Apply the admin's intended adjustment as a delta on top of
-- whatever the current value actually is, atomically.
CREATE OR REPLACE FUNCTION public.adjust_store_inventory_delta(p_store_id uuid, p_product_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_new integer;
BEGIN
  INSERT INTO store_inventory (store_id, product_id, stock_quantity)
  VALUES (p_store_id, p_product_id, GREATEST(p_delta, 0))
  ON CONFLICT (store_id, product_id)
  DO UPDATE SET stock_quantity = GREATEST(store_inventory.stock_quantity + p_delta, 0), updated_at = now()
  RETURNING stock_quantity INTO v_new;
  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_store_inventory_delta(uuid, uuid, integer) TO authenticated;
