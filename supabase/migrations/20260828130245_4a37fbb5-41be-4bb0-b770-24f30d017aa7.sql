CREATE TABLE public.payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id text NOT NULL,
  razorpay_order_id text,
  purpose text NOT NULL DEFAULT 'order',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_details jsonb,
  customer_name text,
  customer_phone text,
  customer_email text,
  amount numeric NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  coupon_code text,
  discount_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_attempts_payment_id_key ON public.payment_attempts (payment_id);
CREATE INDEX payment_attempts_status_idx ON public.payment_attempts (status, created_at DESC);

GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT UPDATE ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payment attempts"
ON public.payment_attempts FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can update payment attempts"
ON public.payment_attempts FOR UPDATE TO authenticated
USING (public.is_any_admin(auth.uid()))
WITH CHECK (public.is_any_admin(auth.uid()));

CREATE TRIGGER update_payment_attempts_updated_at
BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();