-- 1. Profiles: founder status + settings version
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founder_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS mlm_settings_version_id UUID;

-- 2. Products: HSN code
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- 3. MLM settings versions
CREATE TABLE IF NOT EXISTS public.mlm_settings_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings JSONB NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mlm_settings_versions TO authenticated;
GRANT INSERT ON public.mlm_settings_versions TO authenticated;
GRANT ALL ON public.mlm_settings_versions TO service_role;

ALTER TABLE public.mlm_settings_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settings versions"
ON public.mlm_settings_versions FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_mlm_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "MLM admins can create settings versions"
ON public.mlm_settings_versions FOR INSERT TO authenticated
WITH CHECK (public.is_mlm_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

-- 4. Founder payment logs
CREATE TABLE IF NOT EXISTS public.founder_payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  payment_id TEXT,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.founder_payment_logs TO authenticated;
GRANT ALL ON public.founder_payment_logs TO service_role;

ALTER TABLE public.founder_payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own founder payments"
ON public.founder_payment_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all founder payments"
ON public.founder_payment_logs FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()) OR public.is_mlm_admin(auth.uid()));

CREATE TRIGGER update_founder_payment_logs_updated_at
BEFORE UPDATE ON public.founder_payment_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Seed initial version from current settings
INSERT INTO public.mlm_settings_versions (settings, note)
SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb), 'Initial snapshot'
FROM public.mlm_settings;

-- Stamp all existing users with the initial version
UPDATE public.profiles
SET mlm_settings_version_id = (SELECT id FROM public.mlm_settings_versions ORDER BY effective_from DESC LIMIT 1)
WHERE mlm_settings_version_id IS NULL;

-- Mark existing founders as active founders
UPDATE public.profiles p
SET founder_status = 'active'
WHERE p.is_designated_founder = true OR p.user_level = 'founder';

-- 6. Helper: read a setting for a given user, honouring their pinned version
CREATE OR REPLACE FUNCTION public.get_user_mlm_setting(_user_id uuid, _key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version_id uuid;
  v_settings jsonb;
  v_value jsonb;
BEGIN
  SELECT mlm_settings_version_id INTO v_version_id FROM profiles WHERE id = _user_id;

  IF v_version_id IS NOT NULL THEN
    SELECT settings INTO v_settings FROM mlm_settings_versions WHERE id = v_version_id;
    IF v_settings IS NOT NULL AND v_settings ? _key THEN
      RETURN v_settings -> _key;
    END IF;
  END IF;

  SELECT value INTO v_value FROM mlm_settings WHERE key = _key;
  RETURN v_value;
END;
$$;

-- 7. Stamp new profiles with the current version
CREATE OR REPLACE FUNCTION public.stamp_profile_settings_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.mlm_settings_version_id IS NULL THEN
    SELECT id INTO NEW.mlm_settings_version_id
    FROM mlm_settings_versions ORDER BY effective_from DESC, created_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_profile_settings_version_trg ON public.profiles;
CREATE TRIGGER stamp_profile_settings_version_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.stamp_profile_settings_version();

-- 8. Version-aware commission functions
CREATE OR REPLACE FUNCTION public.credit_purchase_commission(p_user_id uuid, p_order_total numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_master_id UUID;
  v_commission_rate NUMERIC;
  v_commission_amount NUMERIC;
  v_settings JSONB;
BEGIN
  SELECT referred_by INTO v_master_id FROM profiles WHERE id = p_user_id;
  IF v_master_id IS NULL THEN RETURN false; END IF;

  -- Use the upline's pinned settings version
  v_settings := get_user_mlm_setting(v_master_id, 'purchase_commission_rate');
  v_commission_rate := COALESCE((v_settings->>'percentage')::NUMERIC, 5) / 100;
  v_commission_amount := p_order_total * v_commission_rate;

  IF v_commission_amount <= 0 THEN RETURN false; END IF;

  UPDATE wallets
  SET balance = balance + v_commission_amount,
      purchase_only_balance = purchase_only_balance + v_commission_amount,
      updated_at = now()
  WHERE user_id = v_master_id;

  INSERT INTO wallet_transactions (wallet_id, amount, type, description, is_withdrawable, source_user_id, balance_after)
  SELECT w.id, v_commission_amount, 'credit',
         'Commission from associate purchase',
         false, p_user_id, w.balance
  FROM wallets w WHERE w.user_id = v_master_id;

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (v_master_id, 'Commission Credited!',
          'You earned ₹' || ROUND(v_commission_amount, 2) || ' commission from an associate purchase.',
          'success');

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_founder_commission(p_new_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_user_id UUID;
  v_upline_id UUID;
  v_upline_level TEXT;
  v_upline_wallet_id UUID;
  v_upline_new_balance NUMERIC;
  v_level_depth INTEGER := 0;
  v_max_depth INTEGER := 20;
  v_level_commissions JSONB;
  v_levels JSONB;
  v_commission_amount NUMERIC := 0;
  v_level_enabled BOOLEAN := true;
  v_per_level_enabled BOOLEAN := true;
  v_per_level_withdrawable BOOLEAN := true;
  v_founder_reg_settings JSONB;
  v_founder_reg_enabled BOOLEAN := false;
  v_founder_reg_percentage NUMERIC := 0;
  v_registration_fee NUMERIC := 0;
  v_founder_percentage_amount NUMERIC := 0;
BEGIN
  SELECT registration_fee_paid INTO v_registration_fee FROM profiles WHERE id = p_new_user_id;
  v_registration_fee := COALESCE(v_registration_fee, 0);

  SELECT referred_by INTO v_current_user_id FROM profiles WHERE id = p_new_user_id;

  WHILE v_current_user_id IS NOT NULL AND v_level_depth < v_max_depth LOOP
    v_level_depth := v_level_depth + 1;

    SELECT user_level::TEXT, referred_by INTO v_upline_level, v_upline_id
    FROM profiles WHERE id = v_current_user_id;

    -- Settings snapshot pinned to the earning upline user
    v_level_commissions := get_user_mlm_setting(v_current_user_id, 'founder_level_commissions');
    v_level_enabled := COALESCE((v_level_commissions->>'enabled')::BOOLEAN, false);
    v_levels := v_level_commissions->'levels';

    v_founder_reg_settings := get_user_mlm_setting(v_current_user_id, 'founder_registration_commission');
    v_founder_reg_enabled := COALESCE((v_founder_reg_settings->>'enabled')::BOOLEAN, false);
    v_founder_reg_percentage := COALESCE((v_founder_reg_settings->>'percentage')::NUMERIC, 5);

    v_commission_amount := 0;
    v_per_level_enabled := true;
    v_per_level_withdrawable := true;

    IF v_level_enabled AND v_levels IS NOT NULL THEN
      DECLARE
        v_level_entry JSONB;
      BEGIN
        FOR v_level_entry IN SELECT * FROM jsonb_array_elements(v_levels)
        LOOP
          IF (v_level_entry->>'depth')::INTEGER = v_level_depth THEN
            v_per_level_enabled := COALESCE((v_level_entry->>'enabled')::BOOLEAN, true);
            v_per_level_withdrawable := COALESCE((v_level_entry->>'is_withdrawable')::BOOLEAN, true);
            IF v_per_level_enabled THEN
              v_commission_amount := (v_level_entry->>'amount')::NUMERIC;
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END;
    END IF;

    IF NOT v_per_level_enabled THEN
      v_current_user_id := v_upline_id;
      CONTINUE;
    END IF;

    IF v_upline_level = 'founder' AND v_founder_reg_enabled AND v_registration_fee > 0 THEN
      v_founder_percentage_amount := (v_registration_fee * v_founder_reg_percentage / 100);
      v_commission_amount := v_commission_amount + v_founder_percentage_amount;
    ELSE
      v_founder_percentage_amount := 0;
    END IF;

    IF v_commission_amount > 0 THEN
      SELECT id INTO v_upline_wallet_id FROM wallets WHERE user_id = v_current_user_id;

      IF v_upline_wallet_id IS NOT NULL THEN
        IF v_per_level_withdrawable THEN
          UPDATE wallets
          SET balance = balance + v_commission_amount,
              withdrawable_balance = withdrawable_balance + v_commission_amount,
              updated_at = now()
          WHERE id = v_upline_wallet_id
          RETURNING balance INTO v_upline_new_balance;
        ELSE
          UPDATE wallets
          SET balance = balance + v_commission_amount,
              purchase_only_balance = purchase_only_balance + v_commission_amount,
              updated_at = now()
          WHERE id = v_upline_wallet_id
          RETURNING balance INTO v_upline_new_balance;
        END IF;

        INSERT INTO wallet_transactions (
          wallet_id, type, amount, balance_after,
          description, source_user_id, is_withdrawable
        )
        VALUES (
          v_upline_wallet_id, 'referral_bonus', v_commission_amount, v_upline_new_balance,
          CASE
            WHEN v_founder_percentage_amount > 0
            THEN 'Multi-level commission (Level ' || v_level_depth || ') + ' || v_founder_reg_percentage || '% registration fee'
            ELSE 'Multi-level commission (Level ' || v_level_depth || ') for new member registration'
          END,
          p_new_user_id, v_per_level_withdrawable
        );

        INSERT INTO notifications (user_id, type, title, message)
        VALUES (
          v_current_user_id, 'earning', 'Network Commission Earned',
          'You earned ₹' || v_commission_amount || ' commission (Level ' || v_level_depth || ') for a new member in your network!'
        );
      END IF;
    END IF;

    v_current_user_id := v_upline_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_mlm_referral(p_referral_code text, p_referred_user_id uuid, p_registration_fee numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer_id uuid;
  v_referral_code_id uuid;
  v_referrer_wallet_id uuid;
  v_referrer_new_balance numeric;
  v_referrer_referral_count integer;
  v_bonus_amount numeric := 0;
  v_bonus_withdrawable boolean := true;
  v_first_10_bonus numeric := 500;
  v_first_10_withdrawable boolean := false;
  v_beyond_10_bonus numeric := 200;
  v_beyond_10_withdrawable boolean := true;
  v_welcome_bonus numeric := 50;
  v_welcome_withdrawable boolean := false;
  v_setting_value jsonb;
  v_already_credited boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE source_user_id = p_referred_user_id AND type = 'referral_bonus'
  ) INTO v_already_credited;
  IF v_already_credited THEN
    RETURN;
  END IF;

  SELECT id, user_id INTO v_referral_code_id, v_referrer_id
  FROM referral_codes WHERE code = p_referral_code AND is_active = true;
  IF v_referral_code_id IS NULL THEN RETURN; END IF;

  -- Referrer bonuses use the referrer's pinned settings version
  v_setting_value := get_user_mlm_setting(v_referrer_id, 'referral_bonus_first_10');
  IF v_setting_value IS NOT NULL THEN
    v_first_10_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_first_10_bonus);
    v_first_10_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_first_10_withdrawable);
  END IF;

  v_setting_value := get_user_mlm_setting(v_referrer_id, 'referral_bonus_beyond_10');
  IF v_setting_value IS NOT NULL THEN
    v_beyond_10_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_beyond_10_bonus);
    v_beyond_10_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_beyond_10_withdrawable);
  END IF;

  -- Welcome bonus uses the new user's pinned settings version
  v_setting_value := get_user_mlm_setting(p_referred_user_id, 'welcome_bonus');
  IF v_setting_value IS NOT NULL THEN
    v_welcome_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_welcome_bonus);
    v_welcome_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_welcome_withdrawable);
  END IF;

  UPDATE referral_codes SET usage_count = usage_count + 1 WHERE id = v_referral_code_id;

  INSERT INTO referrals (referrer_id, referred_id, referral_code_id, incentive_paid)
  VALUES (v_referrer_id, p_referred_user_id, v_referral_code_id, true)
  ON CONFLICT DO NOTHING;

  UPDATE profiles SET referred_by = COALESCE(referred_by, v_referrer_id) WHERE id = p_referred_user_id;

  SELECT referral_count INTO v_referrer_referral_count FROM profiles WHERE id = v_referrer_id;

  IF v_referrer_referral_count < 10 THEN
    v_bonus_amount := v_first_10_bonus;
    v_bonus_withdrawable := v_first_10_withdrawable;
  ELSE
    v_bonus_amount := v_beyond_10_bonus;
    v_bonus_withdrawable := v_beyond_10_withdrawable;
  END IF;

  UPDATE profiles SET referral_count = referral_count + 1 WHERE id = v_referrer_id;

  SELECT id INTO v_referrer_wallet_id FROM wallets WHERE user_id = v_referrer_id;

  IF v_referrer_wallet_id IS NOT NULL AND v_bonus_amount > 0 THEN
    IF v_bonus_withdrawable THEN
      UPDATE wallets
      SET balance = balance + v_bonus_amount,
          withdrawable_balance = withdrawable_balance + v_bonus_amount,
          updated_at = now()
      WHERE id = v_referrer_wallet_id
      RETURNING balance INTO v_referrer_new_balance;
    ELSE
      UPDATE wallets
      SET balance = balance + v_bonus_amount,
          purchase_only_balance = purchase_only_balance + v_bonus_amount,
          updated_at = now()
      WHERE id = v_referrer_wallet_id
      RETURNING balance INTO v_referrer_new_balance;
    END IF;

    INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, source_user_id, is_withdrawable)
    VALUES (v_referrer_wallet_id, 'referral_bonus', v_bonus_amount, v_referrer_new_balance,
            'Referral bonus for new member signup', p_referred_user_id, v_bonus_withdrawable);

    INSERT INTO notifications (user_id, type, title, message)
    VALUES (v_referrer_id, 'earning', 'Referral Bonus Earned',
            'You earned ₹' || v_bonus_amount || ' for a new paid member!');
  END IF;

  PERFORM credit_founder_commission(p_referred_user_id);

  PERFORM generate_user_referral_code(p_referred_user_id);

  IF v_welcome_bonus > 0 THEN
    DECLARE
      v_new_user_wallet_id uuid;
      v_new_user_balance numeric;
    BEGIN
      SELECT id INTO v_new_user_wallet_id FROM wallets WHERE user_id = p_referred_user_id;
      IF v_new_user_wallet_id IS NOT NULL THEN
        IF v_welcome_withdrawable THEN
          UPDATE wallets
          SET balance = balance + v_welcome_bonus,
              withdrawable_balance = withdrawable_balance + v_welcome_bonus,
              updated_at = now()
          WHERE id = v_new_user_wallet_id
          RETURNING balance INTO v_new_user_balance;
        ELSE
          UPDATE wallets
          SET balance = balance + v_welcome_bonus,
              purchase_only_balance = purchase_only_balance + v_welcome_bonus,
              updated_at = now()
          WHERE id = v_new_user_wallet_id
          RETURNING balance INTO v_new_user_balance;
        END IF;

        INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, is_withdrawable)
        VALUES (v_new_user_wallet_id, 'credit', v_welcome_bonus, v_new_user_balance,
                'Welcome bonus for joining ELA Foods', v_welcome_withdrawable);
      END IF;
    END;
  END IF;
END;
$$;