-- 20260905020000_atomic_store_inventory_delta
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

-- 20260905040000_dedupe_wallet_credits
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_add_money_reference_unique
  ON public.wallet_transactions (reference_id)
  WHERE type = 'add_money' AND reference_id IS NOT NULL;

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
  PERFORM pg_advisory_xact_lock(hashtext('process_mlm_referral:' || p_referred_user_id::text));

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