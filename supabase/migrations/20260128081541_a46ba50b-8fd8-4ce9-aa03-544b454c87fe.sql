-- Update credit_founder_commission function to support percentage-based founder registration commission
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
  v_max_depth INTEGER := 10;
  v_settings JSONB;
  v_master_commission NUMERIC := 0;
  v_founder_commission NUMERIC := 0;
  v_is_withdrawable BOOLEAN := false;
  v_founder_reg_settings JSONB;
  v_founder_reg_enabled BOOLEAN := false;
  v_founder_reg_percentage NUMERIC := 0;
  v_registration_fee NUMERIC := 0;
  v_founder_percentage_amount NUMERIC := 0;
BEGIN
  -- Get upline commission settings
  SELECT value INTO v_settings FROM mlm_settings WHERE key = 'upline_commission';
  IF v_settings IS NOT NULL THEN
    v_master_commission := COALESCE((v_settings->>'master_amount')::NUMERIC, 50);
    v_founder_commission := COALESCE((v_settings->>'founder_amount')::NUMERIC, 100);
    v_is_withdrawable := COALESCE((v_settings->>'is_withdrawable')::BOOLEAN, true);
  ELSE
    v_master_commission := 50;
    v_founder_commission := 100;
    v_is_withdrawable := true;
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
  
  -- Traverse up the tree until we hit a founder or reach max depth
  WHILE v_current_user_id IS NOT NULL AND v_level_depth < v_max_depth LOOP
    v_level_depth := v_level_depth + 1;
    
    -- Get the current upline's level
    SELECT user_level::TEXT, referred_by INTO v_upline_level, v_upline_id 
    FROM profiles WHERE id = v_current_user_id;
    
    -- Determine commission amount based on user level
    DECLARE
      v_commission_amount NUMERIC;
    BEGIN
      IF v_upline_level = 'founder' THEN
        v_commission_amount := v_founder_commission;
        
        -- Add percentage-based commission if enabled
        IF v_founder_reg_enabled AND v_registration_fee > 0 THEN
          v_founder_percentage_amount := (v_registration_fee * v_founder_reg_percentage / 100);
          v_commission_amount := v_commission_amount + v_founder_percentage_amount;
        END IF;
      ELSE
        v_commission_amount := v_master_commission;
      END IF;
      
      -- Skip if commission is 0
      IF v_commission_amount > 0 THEN
        -- Get upline's wallet
        SELECT id INTO v_upline_wallet_id FROM wallets WHERE user_id = v_current_user_id;
        
        IF v_upline_wallet_id IS NOT NULL THEN
          -- Credit the upline's wallet
          IF v_is_withdrawable THEN
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
          
          -- Create transaction record with detailed description
          INSERT INTO wallet_transactions (
            wallet_id, type, amount, balance_after, 
            description, source_user_id, is_withdrawable
          )
          VALUES (
            v_upline_wallet_id, 'referral_bonus', v_commission_amount, v_upline_new_balance,
            CASE 
              WHEN v_upline_level = 'founder' AND v_founder_reg_enabled AND v_founder_percentage_amount > 0 
              THEN 'Upline commission (Level ' || v_level_depth || ') + ' || v_founder_reg_percentage || '% registration fee'
              ELSE 'Upline commission (Level ' || v_level_depth || ') for new member registration'
            END,
            p_new_user_id, v_is_withdrawable
          );
          
          -- Notify the upline
          INSERT INTO notifications (user_id, type, title, message)
          VALUES (
            v_current_user_id, 'earning', 'Upline Commission Earned',
            'You earned ₹' || v_commission_amount || ' upline commission for a new member in your network!'
          );
        END IF;
      END IF;
    END;
    
    -- If we've reached a founder, stop traversing
    IF v_upline_level = 'founder' THEN
      EXIT;
    END IF;
    
    -- Move up to the next level
    v_current_user_id := v_upline_id;
  END LOOP;
END;
$function$;