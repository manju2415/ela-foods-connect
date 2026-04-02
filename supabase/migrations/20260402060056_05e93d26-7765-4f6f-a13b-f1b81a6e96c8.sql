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
  v_settings JSONB;
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
  -- Get multi-level commission settings
  SELECT value INTO v_level_commissions FROM mlm_settings WHERE key = 'founder_level_commissions';
  IF v_level_commissions IS NOT NULL THEN
    v_level_enabled := COALESCE((v_level_commissions->>'enabled')::BOOLEAN, true);
    v_levels := v_level_commissions->'levels';
  ELSE
    v_level_enabled := false;
  END IF;

  IF NOT v_level_enabled OR v_levels IS NULL THEN
    RETURN;
  END IF;

  -- Get founder registration commission settings
  SELECT value INTO v_founder_reg_settings FROM mlm_settings WHERE key = 'founder_registration_commission';
  IF v_founder_reg_settings IS NOT NULL THEN
    v_founder_reg_enabled := COALESCE((v_founder_reg_settings->>'enabled')::BOOLEAN, false);
    v_founder_reg_percentage := COALESCE((v_founder_reg_settings->>'percentage')::NUMERIC, 5);
  END IF;

  -- Get registration fee paid by the new user
  SELECT registration_fee_paid INTO v_registration_fee FROM profiles WHERE id = p_new_user_id;
  v_registration_fee := COALESCE(v_registration_fee, 0);

  -- Start from the new user's referrer
  SELECT referred_by INTO v_current_user_id FROM profiles WHERE id = p_new_user_id;
  
  WHILE v_current_user_id IS NOT NULL AND v_level_depth < v_max_depth LOOP
    v_level_depth := v_level_depth + 1;
    
    SELECT user_level::TEXT, referred_by INTO v_upline_level, v_upline_id 
    FROM profiles WHERE id = v_current_user_id;
    
    -- Look up commission for this depth, respecting per-level enabled and is_withdrawable flags
    v_commission_amount := 0;
    v_per_level_enabled := true;
    v_per_level_withdrawable := true;
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

    -- Skip if this level is disabled
    IF NOT v_per_level_enabled THEN
      v_current_user_id := v_upline_id;
      CONTINUE;
    END IF;

    -- Add percentage-based commission for founders if enabled
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
$function$;