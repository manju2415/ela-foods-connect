-- No RLS policy has ever allowed a customer to update their own order — only
-- SELECT and INSERT policies exist for the owning user. Checkout.tsx already
-- calls orders.update({status:'cancelled', payment_status:'failed'}) on a
-- failed/cancelled online payment and tells the customer "stock was
-- restored", but that update silently affects zero rows under RLS (Supabase
-- does not treat a zero-row UPDATE as an error), so the order is left stuck
-- 'pending' forever and the stock it reserved is never released by
-- restore_cancelled_order_stock (which only fires on an actual transition to
-- 'cancelled'). This has been happening on every abandoned/failed online
-- checkout. A trigger locks the update down to exactly that one transition
-- so a customer can't use this path to change anything else about the order.
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

  -- A delivery partner's own update is handled by
  -- restrict_driver_order_columns below; this only narrows the customer's
  -- self-service path (auth.uid() = orders.user_id).
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
    -- Allow exactly this transition; force payment_status to 'failed' and
    -- every other column back to its old value regardless of what the
    -- client sent alongside status.
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

-- Delivery partners could update any column on an order assigned to them —
-- the policy only checked assignment, not which fields moved, so payment
-- status, totals, and other sensitive fields were writable through it too.
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

  -- A delivery partner may only move status among the delivery-progress
  -- states the driver app actually sets (DeliveryDashboard.tsx) — 'shipped'
  -- after pickup, 'out_for_delivery', 'delivered', or reverting to
  -- 'confirmed' on a rejected assignment — never 'cancelled' or 'pending',
  -- and never anything about pricing, ownership, or payment provenance.
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
