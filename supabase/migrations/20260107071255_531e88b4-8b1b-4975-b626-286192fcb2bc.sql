-- Add user_level enum for hierarchy tracking
CREATE TYPE public.user_level AS ENUM ('founder', 'master', 'associate');

-- Add hierarchy tracking to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS user_level user_level DEFAULT 'associate',
ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS registration_fee_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS bank_ifsc TEXT,
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;

-- Split wallet into withdrawable and purchase-only balances
ALTER TABLE public.wallets 
ADD COLUMN IF NOT EXISTS withdrawable_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS purchase_only_balance NUMERIC DEFAULT 0;

-- Add wallet transaction subtype for tracking
ALTER TABLE public.wallet_transactions 
ADD COLUMN IF NOT EXISTS is_withdrawable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS source_user_id UUID;

-- Create table for MLM settings (configurable by admin)
CREATE TABLE IF NOT EXISTS public.mlm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.mlm_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for mlm_settings
CREATE POLICY "Anyone can view MLM settings" ON public.mlm_settings
FOR SELECT USING (true);

CREATE POLICY "Super admins can manage MLM settings" ON public.mlm_settings
FOR ALL USING (is_super_admin(auth.uid()));

-- Insert default MLM settings
INSERT INTO public.mlm_settings (key, value, description) VALUES
('registration_fee', '{"total": 2000, "non_refundable": 1000, "wallet_credit": 1000}', 'Registration fee breakdown'),
('founder_registration_fee', '{"total": 5000, "non_refundable": 2000, "wallet_credit": 3000}', 'Founder registration fee'),
('referral_bonus_first_10', '{"amount": 200, "is_withdrawable": true}', 'Bonus for first 10 referrals'),
('referral_bonus_beyond_10', '{"amount": 100, "is_withdrawable": false}', 'Bonus for referrals beyond 10'),
('founder_referral_bonus', '{"amount": 300, "is_withdrawable": true}', 'Founder bonus per referral'),
('purchase_commission_rate', '{"percentage": 5}', 'Percentage of associate purchase credited to master'),
('welcome_bonus', '{"amount": 50, "is_withdrawable": false}', 'Welcome bonus for new users'),
('max_withdrawable_referrals', '{"count": 10}', 'Number of referrals eligible for withdrawable bonus')
ON CONFLICT (key) DO NOTHING;

-- Create user hierarchy view for easy querying
CREATE OR REPLACE VIEW public.user_hierarchy AS
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.user_level,
  p.referred_by,
  p.referral_count,
  rp.full_name as referred_by_name,
  rp.email as referred_by_email,
  w.balance as total_wallet_balance,
  w.withdrawable_balance,
  w.purchase_only_balance
FROM public.profiles p
LEFT JOIN public.profiles rp ON p.referred_by = rp.id
LEFT JOIN public.wallets w ON p.id = w.user_id;

-- Function to get user's downline (all users referred by this user and their referrals)
CREATE OR REPLACE FUNCTION public.get_user_downline(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  user_level user_level,
  level_depth INTEGER,
  referred_by UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE downline AS (
    -- Base case: direct referrals
    SELECT p.id as user_id, p.email, p.full_name, p.user_level, 1 as level_depth, p.referred_by
    FROM profiles p
    WHERE p.referred_by = p_user_id
    
    UNION ALL
    
    -- Recursive case: referrals of referrals
    SELECT p.id, p.email, p.full_name, p.user_level, d.level_depth + 1, p.referred_by
    FROM profiles p
    INNER JOIN downline d ON p.referred_by = d.user_id
    WHERE d.level_depth < 10 -- Limit depth to prevent infinite recursion
  )
  SELECT * FROM downline ORDER BY level_depth, full_name;
$$;

-- Function to process enhanced referral with MLM logic
CREATE OR REPLACE FUNCTION public.process_mlm_referral(
  p_referral_code TEXT,
  p_referred_user_id UUID,
  p_registration_fee NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_code_id UUID;
  v_referrer_id UUID;
  v_referrer_level user_level;
  v_referrer_count INTEGER;
  v_bonus_amount NUMERIC;
  v_is_withdrawable BOOLEAN;
  v_wallet_credit NUMERIC;
  v_settings JSONB;
  v_max_withdrawable INTEGER;
BEGIN
  -- Find the referral code and referrer
  SELECT rc.id, rc.user_id, p.user_level, p.referral_count
  INTO v_referral_code_id, v_referrer_id, v_referrer_level, v_referrer_count
  FROM referral_codes rc
  JOIN profiles p ON rc.user_id = p.id
  WHERE rc.code = p_referral_code AND rc.is_active = true
  AND (rc.max_uses IS NULL OR rc.usage_count < rc.max_uses);
  
  IF v_referral_code_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;
  
  -- Get MLM settings
  SELECT value INTO v_settings FROM mlm_settings WHERE key = 'max_withdrawable_referrals';
  v_max_withdrawable := COALESCE((v_settings->>'count')::INTEGER, 10);
  
  -- Determine bonus based on referrer level and count
  IF v_referrer_level = 'founder' THEN
    SELECT value INTO v_settings FROM mlm_settings WHERE key = 'founder_referral_bonus';
    v_bonus_amount := COALESCE((v_settings->>'amount')::NUMERIC, 300);
    v_is_withdrawable := COALESCE((v_settings->>'is_withdrawable')::BOOLEAN, true);
  ELSIF v_referrer_count < v_max_withdrawable THEN
    SELECT value INTO v_settings FROM mlm_settings WHERE key = 'referral_bonus_first_10';
    v_bonus_amount := COALESCE((v_settings->>'amount')::NUMERIC, 200);
    v_is_withdrawable := COALESCE((v_settings->>'is_withdrawable')::BOOLEAN, true);
  ELSE
    SELECT value INTO v_settings FROM mlm_settings WHERE key = 'referral_bonus_beyond_10';
    v_bonus_amount := COALESCE((v_settings->>'amount')::NUMERIC, 100);
    v_is_withdrawable := COALESCE((v_settings->>'is_withdrawable')::BOOLEAN, false);
  END IF;
  
  -- Update referred user's profile with referrer info
  UPDATE profiles 
  SET referred_by = v_referrer_id,
      user_level = 'associate',
      registration_fee_paid = p_registration_fee
  WHERE id = p_referred_user_id;
  
  -- Increment referrer's referral count
  UPDATE profiles 
  SET referral_count = referral_count + 1
  WHERE id = v_referrer_id;
  
  -- If referrer was associate, upgrade to master
  UPDATE profiles 
  SET user_level = 'master'
  WHERE id = v_referrer_id AND user_level = 'associate';
  
  -- Update referral code usage
  UPDATE referral_codes 
  SET usage_count = usage_count + 1
  WHERE id = v_referral_code_id;
  
  -- Credit referrer's wallet with appropriate bonus
  IF v_is_withdrawable THEN
    UPDATE wallets 
    SET balance = balance + v_bonus_amount,
        withdrawable_balance = withdrawable_balance + v_bonus_amount,
        updated_at = now()
    WHERE user_id = v_referrer_id;
  ELSE
    UPDATE wallets 
    SET balance = balance + v_bonus_amount,
        purchase_only_balance = purchase_only_balance + v_bonus_amount,
        updated_at = now()
    WHERE user_id = v_referrer_id;
  END IF;
  
  -- Record the transaction
  INSERT INTO wallet_transactions (wallet_id, amount, type, description, is_withdrawable, source_user_id, balance_after)
  SELECT w.id, v_bonus_amount, 'referral_bonus', 
         'Referral bonus for new user signup',
         v_is_withdrawable, p_referred_user_id,
         w.balance
  FROM wallets w WHERE w.user_id = v_referrer_id;
  
  -- Create referral record
  INSERT INTO referrals (referrer_id, referred_id, referral_code_id, incentive_amount, incentive_paid)
  VALUES (v_referrer_id, p_referred_user_id, v_referral_code_id, v_bonus_amount, true);
  
  -- Notify referrer
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    v_referrer_id,
    'Referral Bonus Credited!',
    'You earned ₹' || v_bonus_amount || ' for referring a new user.' || 
    CASE WHEN v_is_withdrawable THEN ' This amount is withdrawable.' ELSE ' Use it for purchases.' END,
    'success'
  );
  
  -- Credit new user's wallet with registration fee wallet portion
  SELECT value INTO v_settings FROM mlm_settings WHERE key = 'registration_fee';
  v_wallet_credit := COALESCE((v_settings->>'wallet_credit')::NUMERIC, 1000);
  
  IF v_wallet_credit > 0 THEN
    UPDATE wallets 
    SET balance = balance + v_wallet_credit,
        purchase_only_balance = purchase_only_balance + v_wallet_credit,
        updated_at = now()
    WHERE user_id = p_referred_user_id;
    
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, is_withdrawable, balance_after)
    SELECT w.id, v_wallet_credit, 'credit', 
           'Registration wallet credit',
           false, w.balance
    FROM wallets w WHERE w.user_id = p_referred_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'referrer_bonus', v_bonus_amount,
    'is_withdrawable', v_is_withdrawable,
    'wallet_credit', v_wallet_credit
  );
END;
$$;

-- Function to credit purchase commission to master
CREATE OR REPLACE FUNCTION public.credit_purchase_commission(
  p_user_id UUID,
  p_order_total NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master_id UUID;
  v_commission_rate NUMERIC;
  v_commission_amount NUMERIC;
  v_settings JSONB;
BEGIN
  -- Get the user's master (referred_by)
  SELECT referred_by INTO v_master_id
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_master_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get commission rate
  SELECT value INTO v_settings FROM mlm_settings WHERE key = 'purchase_commission_rate';
  v_commission_rate := COALESCE((v_settings->>'percentage')::NUMERIC, 5) / 100;
  v_commission_amount := p_order_total * v_commission_rate;
  
  IF v_commission_amount <= 0 THEN
    RETURN false;
  END IF;
  
  -- Credit master's wallet (purchase only)
  UPDATE wallets 
  SET balance = balance + v_commission_amount,
      purchase_only_balance = purchase_only_balance + v_commission_amount,
      updated_at = now()
  WHERE user_id = v_master_id;
  
  -- Record transaction
  INSERT INTO wallet_transactions (wallet_id, amount, type, description, is_withdrawable, source_user_id, balance_after)
  SELECT w.id, v_commission_amount, 'credit', 
         'Commission from associate purchase',
         false, p_user_id, w.balance
  FROM wallets w WHERE w.user_id = v_master_id;
  
  -- Notify master
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    v_master_id,
    'Commission Credited!',
    'You earned ₹' || ROUND(v_commission_amount, 2) || ' commission from an associate purchase.',
    'success'
  );
  
  RETURN true;
END;
$$;

-- Trigger to credit commission after order is placed
CREATE OR REPLACE FUNCTION public.trigger_purchase_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process when order status changes to 'delivered' or on initial insert
  IF (TG_OP = 'INSERT' AND NEW.payment_status = 'paid') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status != 'delivered') THEN
    PERFORM credit_purchase_commission(NEW.user_id, NEW.total_amount);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_order_commission ON public.orders;
CREATE TRIGGER on_order_commission
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION trigger_purchase_commission();

-- Function to generate referral code for user
CREATE OR REPLACE FUNCTION public.generate_user_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Check if user already has a code
  SELECT EXISTS(SELECT 1 FROM referral_codes WHERE user_id = p_user_id AND is_active = true)
  INTO v_exists;
  
  IF v_exists THEN
    SELECT code INTO v_new_code FROM referral_codes WHERE user_id = p_user_id AND is_active = true LIMIT 1;
    RETURN v_new_code;
  END IF;
  
  -- Generate unique code
  LOOP
    v_new_code := generate_referral_code();
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_new_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  -- Insert new code
  INSERT INTO referral_codes (user_id, code, is_active)
  VALUES (p_user_id, v_new_code, true);
  
  RETURN v_new_code;
END;
$$;