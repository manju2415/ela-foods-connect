
-- 1) Idempotency guard on process_mlm_referral: skip if bonuses already credited for this referred user
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
  -- Idempotency: if we've already recorded any referral_bonus for this referred user, skip everything.
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

  SELECT value INTO v_setting_value FROM mlm_settings WHERE key = 'referral_bonus_first_10';
  IF v_setting_value IS NOT NULL THEN
    v_first_10_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_first_10_bonus);
    v_first_10_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_first_10_withdrawable);
  END IF;

  SELECT value INTO v_setting_value FROM mlm_settings WHERE key = 'referral_bonus_beyond_10';
  IF v_setting_value IS NOT NULL THEN
    v_beyond_10_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_beyond_10_bonus);
    v_beyond_10_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_beyond_10_withdrawable);
  END IF;

  SELECT value INTO v_setting_value FROM mlm_settings WHERE key = 'welcome_bonus';
  IF v_setting_value IS NOT NULL THEN
    v_welcome_bonus := COALESCE((v_setting_value->>'amount')::numeric, v_welcome_bonus);
    v_welcome_withdrawable := COALESCE((v_setting_value->>'is_withdrawable')::boolean, v_welcome_withdrawable);
  END IF;

  UPDATE referral_codes SET usage_count = usage_count + 1 WHERE id = v_referral_code_id;

  -- Only insert referrals row if one doesn't exist (add-network-user may have pre-inserted a pending row)
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
$function$;

-- 2) Reverse the ₹600 that was credited too early (before the invited user paid).
-- Target: transactions where the source_user (invited user) has not paid their registration fee.
DO $$
DECLARE
  r RECORD;
  v_wallet RECORD;
BEGIN
  FOR r IN
    SELECT wt.id, wt.wallet_id, wt.amount, wt.is_withdrawable, wt.source_user_id
    FROM wallet_transactions wt
    LEFT JOIN profiles p ON p.id = wt.source_user_id
    WHERE wt.type = 'referral_bonus'
      AND (p.registration_fee_paid IS NULL OR p.registration_fee_paid = 0)
  LOOP
    SELECT balance, withdrawable_balance, purchase_only_balance INTO v_wallet
    FROM wallets WHERE id = r.wallet_id FOR UPDATE;

    IF COALESCE(r.is_withdrawable, false) THEN
      UPDATE wallets
      SET balance = GREATEST(balance - r.amount, 0),
          withdrawable_balance = GREATEST(withdrawable_balance - r.amount, 0),
          updated_at = now()
      WHERE id = r.wallet_id;
    ELSE
      UPDATE wallets
      SET balance = GREATEST(balance - r.amount, 0),
          purchase_only_balance = GREATEST(purchase_only_balance - r.amount, 0),
          updated_at = now()
      WHERE id = r.wallet_id;
    END IF;

    INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, source_user_id, is_withdrawable)
    SELECT r.wallet_id, 'debit', r.amount, w.balance,
           'Reversal: premature referral bonus (invitee has not completed registration payment)',
           r.source_user_id, COALESCE(r.is_withdrawable, false)
    FROM wallets w WHERE w.id = r.wallet_id;
  END LOOP;
END;
$$;

-- Reset referral_count for referrers whose invitees haven't paid yet, so they don't inflate the tier
UPDATE profiles p
SET referral_count = (
  SELECT COUNT(*) FROM profiles c
  WHERE c.referred_by = p.id AND COALESCE(c.registration_fee_paid, 0) > 0
);
