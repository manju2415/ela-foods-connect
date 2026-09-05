-- 20260905000000_dedupe_purchase_commission
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

DROP TRIGGER IF EXISTS on_order_commission ON public.orders;
CREATE TRIGGER on_order_commission
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION trigger_purchase_commission();

-- 20260905010000_delivery_partner_order_update
DROP POLICY IF EXISTS "Delivery partners can update their assigned orders" ON public.orders;
CREATE POLICY "Delivery partners can update their assigned orders"
ON public.orders FOR UPDATE TO authenticated
USING (public.is_order_assigned_to_partner(id, auth.uid()))
WITH CHECK (public.is_order_assigned_to_partner(id, auth.uid()));

-- 20260905030000_newsletter_subscribers
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can subscribe to the newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Anyone can subscribe to the newsletter"
ON public.newsletter_subscribers FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins can view newsletter subscribers"
ON public.newsletter_subscribers FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- 20260905050000_check_phones_rate_limit
CREATE TABLE IF NOT EXISTS public.phone_batch_check_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_batch_check_log_user_created_idx
  ON public.phone_batch_check_log (user_id, created_at);

GRANT ALL ON public.phone_batch_check_log TO service_role;

ALTER TABLE public.phone_batch_check_log ENABLE ROW LEVEL SECURITY;

-- 20260905060000_notify_admins_helper
CREATE OR REPLACE FUNCTION public.notify_admins(p_title text, p_message text, p_type text DEFAULT 'info', p_reference_type text DEFAULT NULL, p_reference_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec record;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role IN ('super_admin', 'admin')
  LOOP
    INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (v_rec.user_id, p_title, p_message, p_type, p_reference_type, p_reference_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, uuid) TO authenticated;