-- Update process_mlm_referral to automatically create referral code for new users
CREATE OR REPLACE FUNCTION public.process_mlm_referral(
  p_referral_code text,
  p_referred_user_id uuid,
  p_registration_fee numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_referral_code_id uuid;
  v_referrer_wallet_id uuid;
  v_referrer_new_balance numeric;
  v_referrer_referral_count integer;
  v_bonus_amount numeric := 0;
  v_max_paid_referrals integer := 10;
  v_first_10_bonus numeric := 100;
  v_beyond_10_bonus numeric := 50;
  v_welcome_bonus numeric := 50;
  v_setting_value jsonb;
BEGIN
  -- Get the referral code and referrer
  SELECT id, user_id INTO v_referral_code_id, v_referrer_id
  FROM referral_codes
  WHERE code = p_referral_code AND is_active = true;
  
  IF v_referral_code_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get MLM settings
  SELECT value INTO v_setting_value FROM mlm_settings WHERE key = 'first_10_referral_bonus';
  IF v_setting_value IS NOT NULL THEN
    v_first_10_bonus := (v_setting_value->>'amount')::numeric;
  END IF;
  
  SELECT value INTO v_setting_value FROM mlm_settings WHERE key = 'beyond_10_referral_bonus';
  IF v_setting_value IS NOT NULL THEN
    v_beyond_10_bonus := (v_setting_value->>'amount')::numeric;
  END IF;
  
  SELECT value INTO v_setting_value FROM mlm_settings WHERE key = 'welcome_bonus';
  IF v_setting_value IS NOT NULL AND (v_setting_value->>'enabled')::boolean THEN
    v_welcome_bonus := (v_setting_value->>'amount')::numeric;
  ELSE
    v_welcome_bonus := 0;
  END IF;
  
  -- Update referral code usage
  UPDATE referral_codes SET usage_count = usage_count + 1 WHERE id = v_referral_code_id;
  
  -- Create referral record
  INSERT INTO referrals (referrer_id, referred_id, referral_code_id)
  VALUES (v_referrer_id, p_referred_user_id, v_referral_code_id);
  
  -- Update referred user's profile
  UPDATE profiles SET referred_by = v_referrer_id WHERE id = p_referred_user_id;
  
  -- Get referrer's current referral count
  SELECT referral_count INTO v_referrer_referral_count FROM profiles WHERE id = v_referrer_id;
  
  -- Calculate bonus amount
  IF v_referrer_referral_count < 10 THEN
    v_bonus_amount := v_first_10_bonus;
  ELSE
    v_bonus_amount := v_beyond_10_bonus;
  END IF;
  
  -- Update referrer's profile
  UPDATE profiles SET referral_count = referral_count + 1 WHERE id = v_referrer_id;
  
  -- Get referrer's wallet
  SELECT id INTO v_referrer_wallet_id FROM wallets WHERE user_id = v_referrer_id;
  
  IF v_referrer_wallet_id IS NOT NULL AND v_bonus_amount > 0 THEN
    -- Credit referrer bonus
    UPDATE wallets 
    SET balance = balance + v_bonus_amount,
        withdrawable_balance = withdrawable_balance + v_bonus_amount,
        updated_at = now()
    WHERE id = v_referrer_wallet_id
    RETURNING balance INTO v_referrer_new_balance;
    
    -- Create transaction
    INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, source_user_id, is_withdrawable)
    VALUES (v_referrer_wallet_id, 'referral_bonus', v_bonus_amount, v_referrer_new_balance, 
            'Referral bonus for new member signup', p_referred_user_id, true);
    
    -- Notify referrer
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (v_referrer_id, 'earning', 'Referral Bonus Earned', 
            'You earned ₹' || v_bonus_amount || ' for referring a new member!');
  END IF;
  
  -- Credit founder commission (multi-level)
  PERFORM credit_founder_commission(p_referred_user_id);
  
  -- AUTOMATICALLY CREATE REFERRAL CODE FOR NEW USER
  PERFORM generate_user_referral_code(p_referred_user_id);
  
  -- Handle welcome bonus for new user
  IF v_welcome_bonus > 0 THEN
    DECLARE
      v_new_user_wallet_id uuid;
      v_new_user_balance numeric;
    BEGIN
      SELECT id INTO v_new_user_wallet_id FROM wallets WHERE user_id = p_referred_user_id;
      
      IF v_new_user_wallet_id IS NOT NULL THEN
        UPDATE wallets 
        SET balance = balance + v_welcome_bonus,
            purchase_only_balance = purchase_only_balance + v_welcome_bonus,
            updated_at = now()
        WHERE id = v_new_user_wallet_id
        RETURNING balance INTO v_new_user_balance;
        
        INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, is_withdrawable)
        VALUES (v_new_user_wallet_id, 'credit', v_welcome_bonus, v_new_user_balance, 
                'Welcome bonus for joining ELA Foods', false);
      END IF;
    END;
  END IF;
END;
$$;

-- Also generate referral codes for existing members who don't have one
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.id 
    FROM profiles p
    LEFT JOIN referral_codes rc ON rc.user_id = p.id
    WHERE rc.id IS NULL
  LOOP
    PERFORM generate_user_referral_code(r.id);
  END LOOP;
END $$;