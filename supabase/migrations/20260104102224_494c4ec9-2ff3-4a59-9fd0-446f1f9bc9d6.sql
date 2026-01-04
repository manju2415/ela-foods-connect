-- Add delivery_partner to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'delivery_partner';

-- Delivery partners table
CREATE TABLE public.delivery_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  vehicle_type TEXT,
  vehicle_number TEXT,
  is_available BOOLEAN DEFAULT true,
  current_location JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery partners"
ON public.delivery_partners FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Delivery partners can view their own record"
ON public.delivery_partners FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Delivery partners can update their own record"
ON public.delivery_partners FOR UPDATE
USING (auth.uid() = user_id);

-- Order assignments table
CREATE TABLE public.order_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES public.delivery_partners(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  picked_up_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'assigned',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

ALTER TABLE public.order_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage assignments"
ON public.order_assignments FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Delivery partners can view their assignments"
ON public.order_assignments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.delivery_partners dp
  WHERE dp.id = order_assignments.delivery_partner_id
  AND dp.user_id = auth.uid()
));

CREATE POLICY "Delivery partners can update their assignments"
ON public.order_assignments FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.delivery_partners dp
  WHERE dp.id = order_assignments.delivery_partner_id
  AND dp.user_id = auth.uid()
));

CREATE POLICY "Users can view their order assignments"
ON public.order_assignments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_assignments.order_id
  AND o.user_id = auth.uid()
));

-- Notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  reference_type TEXT,
  reference_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all notifications"
ON public.notifications FOR ALL
USING (is_admin(auth.uid()));

-- Function to add wallet transaction and update balance
CREATE OR REPLACE FUNCTION public.add_wallet_transaction(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type wallet_transaction_type,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_transaction_id UUID;
BEGIN
  -- Get wallet
  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;
  
  -- Calculate new balance
  IF p_type IN ('credit', 'referral_bonus', 'refund') THEN
    v_new_balance := v_current_balance + p_amount;
  ELSE
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;
    v_new_balance := v_current_balance - p_amount;
  END IF;
  
  -- Update wallet balance
  UPDATE wallets SET balance = v_new_balance, updated_at = now()
  WHERE id = v_wallet_id;
  
  -- Insert transaction
  INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, balance_after)
  VALUES (v_wallet_id, p_amount, p_type, p_description, p_reference_id, v_new_balance)
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$;

-- Function to process referral incentive
CREATE OR REPLACE FUNCTION public.process_referral_incentive(
  p_referral_code TEXT,
  p_referred_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_code_id UUID;
  v_referrer_id UUID;
  v_incentive_amount NUMERIC := 50; -- Default incentive amount
BEGIN
  -- Find the referral code
  SELECT id, user_id INTO v_referral_code_id, v_referrer_id
  FROM referral_codes
  WHERE code = p_referral_code AND is_active = true
  AND (max_uses IS NULL OR usage_count < max_uses);
  
  IF v_referral_code_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Create referral record
  INSERT INTO referrals (referrer_id, referred_id, referral_code_id, incentive_amount)
  VALUES (v_referrer_id, p_referred_user_id, v_referral_code_id, v_incentive_amount);
  
  -- Update referral code usage
  UPDATE referral_codes SET usage_count = usage_count + 1
  WHERE id = v_referral_code_id;
  
  -- Credit referrer's wallet
  PERFORM add_wallet_transaction(
    v_referrer_id,
    v_incentive_amount,
    'referral_bonus',
    'Referral bonus for new user signup'
  );
  
  -- Mark incentive as paid
  UPDATE referrals SET incentive_paid = true
  WHERE referrer_id = v_referrer_id AND referred_id = p_referred_user_id;
  
  -- Create notification for referrer
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    v_referrer_id,
    'Referral Bonus Credited!',
    'You earned ₹' || v_incentive_amount || ' for referring a new user.',
    'success'
  );
  
  RETURN TRUE;
END;
$$;

-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
  VALUES (p_user_id, p_title, p_message, p_type, p_reference_type, p_reference_id)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Trigger to create notification when order status changes
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM create_notification(
      NEW.user_id,
      'Order Status Updated',
      'Your order #' || NEW.order_number || ' is now ' || NEW.status,
      'order',
      'order',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_status_change
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_order_status_change();

-- Enable realtime for orders and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_assignments;

-- Add updated_at triggers
CREATE TRIGGER update_delivery_partners_updated_at
BEFORE UPDATE ON public.delivery_partners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_order_assignments_updated_at
BEFORE UPDATE ON public.order_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();