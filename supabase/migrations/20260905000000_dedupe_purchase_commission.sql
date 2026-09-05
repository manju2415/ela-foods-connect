-- Purchase commission was being credited twice for any order whose
-- payment_status is already 'completed' at insert time (e.g. fully paid by
-- wallet balance): once on INSERT, and again when the order later transitions
-- to 'delivered'. Track whether commission has already been credited per
-- order and guard the trigger with it.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS purchase_commission_credited boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.trigger_purchase_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.purchase_commission_credited THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.payment_status = 'completed') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status != 'delivered') THEN
    IF credit_purchase_commission(NEW.user_id, NEW.total_amount) THEN
      NEW.purchase_commission_credited := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Must run BEFORE the row is written so the credited flag actually persists
-- without a second, recursive UPDATE.
DROP TRIGGER IF EXISTS on_order_commission ON public.orders;
CREATE TRIGGER on_order_commission
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION trigger_purchase_commission();
