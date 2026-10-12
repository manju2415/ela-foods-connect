-- Simple referral scheme + withdrawals switch (client request, 2026-10-10).
--
-- platform_settings.referral_scheme_settings.scheme:
--  'simple' — every MLM payout stops: tiered referral bonus, upline/founder
--             level commissions and purchase commission. When an invited user's
--             first paid order completes, the inviter gets referrer_bonus and the
--             invitee gets welcome_bonus. Same amounts for everyone (founders
--             included), whatever MLM settings version they joined under. Both
--             are purchase-only credits.
--  'mlm'    — today's behaviour, unchanged.
-- The MLM functions are renamed (*_mlm) and their public names become thin
-- wrappers, so switching back to 'mlm' runs exactly the code that runs today.
-- mlm_settings and their versions are not touched.
--
-- platform_settings.withdrawal_settings.withdrawals_enabled:
--  false — request_withdrawal refuses. Turning it off (set_withdrawals_enabled)
--          moves every withdrawable balance to the purchase-only balance and
--          cancels pending requests, refunding them to the purchase-only balance.
--
-- A missing row keeps today's behaviour (MLM scheme, withdrawals on). This
-- migration seeds the client's choice: simple scheme at ₹99 + ₹99, withdrawals off.

BEGIN;

-- ---------------------------------------------------------------------------
-- Switches
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simple_referral_scheme_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value ->> 'scheme' FROM public.platform_settings WHERE key = 'referral_scheme_settings'),
    'mlm'
  ) = 'simple';
$$;
GRANT EXECUTE ON FUNCTION public.simple_referral_scheme_active() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.withdrawals_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Only an explicit false turns withdrawals off.
  SELECT coalesce(
    (SELECT (value ->> 'withdrawals_enabled')::boolean
     FROM public.platform_settings WHERE key = 'withdrawal_settings'),
    true
  ) IS DISTINCT FROM false;
$$;
GRANT EXECUTE ON FUNCTION public.withdrawals_enabled() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep the MLM payout functions under new names (idempotent on re-run)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.process_mlm_referral_mlm(text,uuid,numeric)') IS NULL THEN
    ALTER FUNCTION public.process_mlm_referral(text, uuid, numeric) RENAME TO process_mlm_referral_mlm;
  END IF;
  IF to_regprocedure('public.credit_founder_commission_mlm(uuid)') IS NULL THEN
    ALTER FUNCTION public.credit_founder_commission(uuid) RENAME TO credit_founder_commission_mlm;
  END IF;
  IF to_regprocedure('public.credit_purchase_commission_mlm(uuid,numeric)') IS NULL THEN
    ALTER FUNCTION public.credit_purchase_commission(uuid, numeric) RENAME TO credit_purchase_commission_mlm;
  END IF;
  IF to_regprocedure('public.request_withdrawal_unchecked(uuid,numeric)') IS NULL THEN
    ALTER FUNCTION public.request_withdrawal(uuid, numeric) RENAME TO request_withdrawal_unchecked;
  END IF;
END $$;

-- Internal only: reachable solely through the wrappers below.
REVOKE ALL ON FUNCTION public.process_mlm_referral_mlm(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_founder_commission_mlm(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_purchase_commission_mlm(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_withdrawal_unchecked(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wrappers under the original names (same signatures, so every caller —
-- triggers, other functions, edge functions — keeps working)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_mlm_referral(p_referral_code text, p_referred_user_id uuid, p_registration_fee numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.simple_referral_scheme_active() THEN
    -- No MLM payout. The invite stays unpaid and process_simple_referral pays
    -- it on the invitee's first paid order. Still issue the member's own
    -- invite code, as the MLM path does.
    PERFORM public.generate_user_referral_code(p_referred_user_id);
    RETURN;
  END IF;
  PERFORM public.process_mlm_referral_mlm(p_referral_code, p_referred_user_id, p_registration_fee);
END;
$$;
REVOKE ALL ON FUNCTION public.process_mlm_referral(text, uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.credit_founder_commission(p_new_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.simple_referral_scheme_active() THEN
    RETURN;
  END IF;
  PERFORM public.credit_founder_commission_mlm(p_new_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_founder_commission(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.credit_purchase_commission(p_user_id uuid, p_order_total numeric)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.simple_referral_scheme_active() THEN
    RETURN false;
  END IF;
  RETURN public.credit_purchase_commission_mlm(p_user_id, p_order_total);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_purchase_commission(uuid, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_user_id uuid, p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.withdrawals_enabled() THEN
    RETURN json_build_object('success', false, 'error',
      'Cash withdrawals are turned off. Your wallet balance can be used for purchases.');
  END IF;
  RETURN public.request_withdrawal_unchecked(p_user_id, p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric) TO authenticated;

-- Requests are only ever created through request_withdrawal (which debits the
-- wallet). A direct insert would bypass both the debit and the switch.
DROP POLICY IF EXISTS "Users can create their own withdrawal requests" ON public.withdrawal_requests;

-- ---------------------------------------------------------------------------
-- Simple scheme payout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_simple_referral(p_referred_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral referrals%ROWTYPE;
  v_referrer_id uuid;
  v_code_id uuid;
  v_settings jsonb;
  v_referrer_bonus numeric;
  v_welcome_bonus numeric;
  v_wallet_id uuid;
  v_balance numeric;
BEGIN
  IF p_referred_user_id IS NULL THEN RETURN; END IF;

  -- Cheap exit for the common case (no unpaid invite) before taking the lock.
  SELECT * INTO v_referral FROM referrals WHERE referred_id = p_referred_user_id;
  IF FOUND THEN
    IF coalesce(v_referral.incentive_paid, false) THEN RETURN; END IF;
    v_referrer_id := v_referral.referrer_id;
    v_code_id := v_referral.referral_code_id;
  ELSE
    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_referred_user_id;
  END IF;
  IF v_referrer_id IS NULL OR v_referrer_id = p_referred_user_id THEN RETURN; END IF;

  -- Same lock as the MLM payout, so the two can never both pay one invitee.
  PERFORM pg_advisory_xact_lock(hashtext('process_mlm_referral:' || p_referred_user_id::text));

  -- Already rewarded, under either scheme.
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = p_referred_user_id AND incentive_paid)
     OR EXISTS (SELECT 1 FROM wallet_transactions
                WHERE source_user_id = p_referred_user_id AND type = 'referral_bonus') THEN
    RETURN;
  END IF;

  SELECT value INTO v_settings FROM platform_settings WHERE key = 'referral_scheme_settings';
  v_referrer_bonus := GREATEST(coalesce((v_settings ->> 'referrer_bonus')::numeric, 0), 0);
  v_welcome_bonus := GREATEST(coalesce((v_settings ->> 'welcome_bonus')::numeric, 0), 0);

  IF v_code_id IS NULL THEN
    SELECT id INTO v_code_id FROM referral_codes
    WHERE user_id = v_referrer_id AND is_active = true LIMIT 1;
  END IF;

  INSERT INTO referrals (referrer_id, referred_id, referral_code_id, incentive_amount, incentive_paid)
  VALUES (v_referrer_id, p_referred_user_id, v_code_id, v_referrer_bonus, true)
  ON CONFLICT (referred_id) DO UPDATE
    SET incentive_paid = true, incentive_amount = EXCLUDED.incentive_amount;

  IF v_code_id IS NOT NULL THEN
    UPDATE referral_codes SET usage_count = coalesce(usage_count, 0) + 1 WHERE id = v_code_id;
  END IF;
  UPDATE profiles SET referral_count = coalesce(referral_count, 0) + 1 WHERE id = v_referrer_id;

  IF v_referrer_bonus > 0 THEN
    v_wallet_id := ensure_user_wallet(v_referrer_id);
    IF v_wallet_id IS NOT NULL THEN
      UPDATE wallets
      SET balance = balance + v_referrer_bonus,
          purchase_only_balance = purchase_only_balance + v_referrer_bonus,
          updated_at = now()
      WHERE id = v_wallet_id
      RETURNING balance INTO v_balance;

      INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, source_user_id, is_withdrawable)
      VALUES (v_wallet_id, 'referral_bonus', v_referrer_bonus, v_balance,
              'Referral bonus - your invitee placed their first order', p_referred_user_id, false);

      INSERT INTO notifications (user_id, type, title, message)
      VALUES (v_referrer_id, 'earning', 'Referral Bonus Earned',
              'You earned ₹' || v_referrer_bonus || ' - someone you invited placed their first order!');
    END IF;
  END IF;

  IF v_welcome_bonus > 0 THEN
    v_wallet_id := ensure_user_wallet(p_referred_user_id);
    IF v_wallet_id IS NOT NULL THEN
      UPDATE wallets
      SET balance = balance + v_welcome_bonus,
          purchase_only_balance = purchase_only_balance + v_welcome_bonus,
          updated_at = now()
      WHERE id = v_wallet_id
      RETURNING balance INTO v_balance;

      INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, is_withdrawable)
      VALUES (v_wallet_id, 'credit', v_welcome_bonus, v_balance,
              'Welcome bonus for joining with an invite code', false);

      INSERT INTO notifications (user_id, type, title, message)
      VALUES (p_referred_user_id, 'earning', 'Welcome Bonus',
              '₹' || v_welcome_bonus || ' welcome bonus added to your wallet. Use it on your next order!');
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.process_simple_referral(uuid) FROM PUBLIC, anon, authenticated;

-- Same as 20261004010000, plus the simple-scheme branch.
CREATE OR REPLACE FUNCTION public.trigger_invite_reward_on_first_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT (
    (TG_OP = 'INSERT' AND NEW.payment_status = 'completed') OR
    (TG_OP = 'UPDATE' AND NEW.payment_status = 'completed' AND OLD.payment_status IS DISTINCT FROM 'completed') OR
    (TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
  ) THEN
    RETURN NULL;
  END IF;

  -- Simple scheme: any unpaid invite (old or new) is paid on this order.
  -- A reward problem must never block an order.
  IF public.simple_referral_scheme_active() THEN
    BEGIN
      PERFORM public.process_simple_referral(NEW.user_id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'simple referral reward failed for order %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
  END IF;

  SELECT rc.code INTO v_code
  FROM public.referrals r
  JOIN public.referral_codes rc ON rc.id = r.referral_code_id
  WHERE r.referred_id = NEW.user_id
    AND r.reward_on_first_order
    AND NOT coalesce(r.incentive_paid, false);
  IF v_code IS NULL THEN
    RETURN NULL;
  END IF;

  -- process_mlm_referral is idempotent (one referral_bonus per invitee) and
  -- marks the referral paid. A reward problem must never block an order.
  BEGIN
    PERFORM public.process_mlm_referral(v_code, NEW.user_id, 0);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'invite reward failed for order %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_invite_reward_on_first_order() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Withdrawals off: move balances, cancel pending requests
-- ---------------------------------------------------------------------------
-- Audit trail of the bucket moves (balance itself is unchanged, so no wallet
-- transaction is written for them).
CREATE TABLE IF NOT EXISTS public.wallet_withdrawable_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_withdrawable_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view withdrawable conversions" ON public.wallet_withdrawable_conversions;
CREATE POLICY "Admins can view withdrawable conversions"
ON public.wallet_withdrawable_conversions FOR SELECT TO authenticated
USING (public.is_any_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.move_withdrawable_to_purchase_wallets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_wallet_id uuid;
  v_balance numeric;
  v_cancelled integer := 0;
  v_moved integer := 0;
BEGIN
  -- Pending requests already took the money out of the wallet: cancel them and
  -- return it as purchase-only credit. Approved/processing ones are left for
  -- the admin (the bank transfer may already be under way).
  FOR v_req IN
    SELECT * FROM withdrawal_requests WHERE status = 'pending' FOR UPDATE
  LOOP
    UPDATE withdrawal_requests
    SET status = 'rejected',
        notes = 'Cancelled: cash withdrawals were turned off. The amount was returned to your wallet for purchases.',
        processed_at = now(),
        updated_at = now()
    WHERE id = v_req.id;

    v_wallet_id := ensure_user_wallet(v_req.user_id);
    UPDATE wallets
    SET balance = balance + v_req.amount,
        purchase_only_balance = purchase_only_balance + v_req.amount,
        updated_at = now()
    WHERE id = v_wallet_id
    RETURNING balance INTO v_balance;

    INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, is_withdrawable, reference_id)
    VALUES (v_wallet_id, 'credit', v_req.amount, v_balance,
            'Withdrawal request cancelled - refunded to wallet for purchases', false, v_req.id::text);

    PERFORM create_notification(
      v_req.user_id, 'Withdrawal Cancelled',
      'Cash withdrawals have been turned off. Your ₹' || v_req.amount || ' was returned to your wallet and can be used for purchases.',
      'wallet', 'withdrawal', v_req.id
    );
    v_cancelled := v_cancelled + 1;
  END LOOP;

  WITH old AS (
    SELECT id, user_id, withdrawable_balance AS amount
    FROM wallets WHERE withdrawable_balance > 0
    FOR UPDATE
  ), moved AS (
    UPDATE wallets w
    SET purchase_only_balance = w.purchase_only_balance + old.amount,
        withdrawable_balance = w.withdrawable_balance - old.amount,
        updated_at = now()
    FROM old
    WHERE w.id = old.id
    RETURNING old.id, old.user_id, old.amount
  )
  INSERT INTO wallet_withdrawable_conversions (wallet_id, user_id, amount)
  SELECT id, user_id, amount FROM moved;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RETURN jsonb_build_object('cancelled_requests', v_cancelled, 'wallets_moved', v_moved);
END;
$$;
REVOKE ALL ON FUNCTION public.move_withdrawable_to_purchase_wallets() FROM PUBLIC, anon, authenticated;

-- Super-admin switch. Turning withdrawals off also moves the balances, so the
-- setting and the data can never disagree.
CREATE OR REPLACE FUNCTION public.set_withdrawals_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_enabled IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid value');
  END IF;

  INSERT INTO platform_settings (key, value, description, updated_by)
  VALUES ('withdrawal_settings', jsonb_build_object('withdrawals_enabled', p_enabled),
          'Cash withdrawals on/off (super admin)', auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

  IF NOT p_enabled THEN
    v_result := public.move_withdrawable_to_purchase_wallets();
  END IF;

  RETURN jsonb_build_object('success', true) || v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_withdrawals_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_withdrawals_enabled(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Client's choice: simple scheme at ₹99 + ₹99, withdrawals off
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'referral_scheme_settings',
  '{"scheme": "simple", "referrer_bonus": 99, "welcome_bonus": 99}'::jsonb,
  'Referral scheme: simple (flat bonus on first order) or mlm (super admin)'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'withdrawal_settings',
  '{"withdrawals_enabled": false}'::jsonb,
  'Cash withdrawals on/off (super admin)'
)
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF NOT public.withdrawals_enabled() THEN
    PERFORM public.move_withdrawable_to_purchase_wallets();
  END IF;
END $$;

COMMIT;
