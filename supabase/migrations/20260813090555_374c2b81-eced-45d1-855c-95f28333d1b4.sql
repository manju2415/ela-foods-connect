-- Make bonus crediting wallet-safe
CREATE OR REPLACE FUNCTION public.process_mlm_referral(p_referral_code text, p_referred_user_id uuid, p_registration_fee numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_setting_value := get_user_mlm_setting(p_referred_user_id, 'welcome_bonus');
  IF v_setting_value IS NOT NULL THEN
    v_welcome_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_welcome_bonus);
    v_welcome_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_welcome_withdrawable);
  END IF;

  UPDATE referral_codes SET usage_count = usage_count + 1 WHERE id = v_referral_code_id;

  INSERT INTO referrals (referrer_id, referred_id, referral_code_id, incentive_paid)
  VALUES (v_referrer_id, p_referred_user_id, v_referral_code_id, true)
  ON CONFLICT DO NOTHING;

  UPDATE referrals SET incentive_paid = true
  WHERE referred_id = p_referred_user_id AND referrer_id = v_referrer_id;

  UPDATE profiles SET referred_by = COALESCE(referred_by, v_referrer_id) WHERE id = p_referred_user_id;

  SELECT COALESCE(referral_count, 0) INTO v_referrer_referral_count FROM profiles WHERE id = v_referrer_id;

  IF v_referrer_referral_count < 10 THEN
    v_bonus_amount := v_first_10_bonus;
    v_bonus_withdrawable := v_first_10_withdrawable;
  ELSE
    v_bonus_amount := v_beyond_10_bonus;
    v_bonus_withdrawable := v_beyond_10_withdrawable;
  END IF;

  UPDATE profiles SET referral_count = COALESCE(referral_count, 0) + 1 WHERE id = v_referrer_id;

  -- Never skip the payout because a wallet row is missing
  v_referrer_wallet_id := ensure_user_wallet(v_referrer_id);

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
      v_new_user_wallet_id := ensure_user_wallet(p_referred_user_id);
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
$function$;

-- Upline commissions: create the upline wallet if it does not exist
CREATE OR REPLACE FUNCTION public.credit_founder_commission(p_new_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      v_upline_wallet_id := ensure_user_wallet(v_current_user_id);

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
$function$;

-- Resolve a user's referrer code and credit any pending referral bonus (idempotent)
CREATE OR REPLACE FUNCTION public.credit_pending_referral_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_referrer_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE source_user_id = p_user_id AND type = 'referral_bonus'
  ) THEN
    RETURN;
  END IF;

  SELECT rc.code INTO v_code
  FROM referrals r
  JOIN referral_codes rc ON rc.id = r.referral_code_id
  WHERE r.referred_id = p_user_id AND rc.is_active = true
  LIMIT 1;

  IF v_code IS NULL THEN
    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_user_id;
    IF v_referrer_id IS NULL THEN RETURN; END IF;
    SELECT code INTO v_code FROM referral_codes
    WHERE user_id = v_referrer_id AND is_active = true LIMIT 1;
  END IF;

  IF v_code IS NULL THEN RETURN; END IF;

  PERFORM process_mlm_referral(v_code, p_user_id, COALESCE((SELECT registration_fee_paid FROM profiles WHERE id = p_user_id), 0));
END;
$$;

-- Fire when a member is activated by payment or by an admin status/level change
CREATE OR REPLACE FUNCTION public.trg_profile_activation_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (COALESCE(NEW.registration_fee_paid, 0) > 0 AND COALESCE(OLD.registration_fee_paid, 0) = 0)
     OR (NEW.user_level IS DISTINCT FROM OLD.user_level AND NEW.user_level::text <> 'associate')
     OR (NEW.founder_status IS DISTINCT FROM OLD.founder_status AND NEW.founder_status IN ('active', 'approved'))
  THEN
    PERFORM credit_pending_referral_for_user(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_activation_referral ON public.profiles;
CREATE TRIGGER trg_profiles_activation_referral
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_profile_activation_referral();

-- Fire when an admin grants the member/founding_member role
CREATE OR REPLACE FUNCTION public.trg_user_role_activation_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role::text IN ('member', 'founding_member') THEN
    PERFORM ensure_user_wallet(NEW.user_id);
    PERFORM credit_pending_referral_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_activation_referral ON public.user_roles;
CREATE TRIGGER trg_user_roles_activation_referral
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.trg_user_role_activation_referral();
