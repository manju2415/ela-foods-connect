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
    -- Allow exactly this transition; stock_restored_at is deliberately left
    -- untouched here because restore_cancelled_order_stock_trg runs first
    -- and already set it correctly for this transition.
    NEW.payment_status := 'failed';
  ELSE
    NEW.status := OLD.status;
    NEW.payment_status := OLD.payment_status;
    NEW.stock_restored_at := OLD.stock_restored_at;
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

  RETURN NEW;
END;
$$;