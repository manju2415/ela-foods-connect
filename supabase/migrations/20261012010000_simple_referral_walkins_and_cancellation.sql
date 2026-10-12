-- Simple referral scheme: client follow-up (2026-10-12).
--
-- 1. Walk-ins (joined without an invite code) earn nothing: no referral bonus
--    for anyone and no welcome bonus. Only an explicit invite — a referrals row,
--    written when an invite code is used — is paid. profiles.referred_by alone
--    no longer counts, because walk-in registrations get a random founder there.
--    Existing referred_by-only users whose referrer is not a founder can only
--    have come from an invite code, so they get their referrals row now.
-- 2. If the order that paid the bonuses is cancelled or returned, both bonuses
--    are taken back and the invite is re-armed: the member's next successful
--    paid order pays them again. If either bonus was already spent, what is
--    left is taken back and the invite is closed (no second payout).

BEGIN;

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reward_order_id uuid;

-- ---------------------------------------------------------------------------
-- Backfill invite rows for code-based referred_by-only users (see 1. above)
-- ---------------------------------------------------------------------------
INSERT INTO public.referrals (referrer_id, referred_id, referral_code_id, incentive_amount, incentive_paid)
SELECT p.referred_by, p.id,
       (SELECT rc.id FROM public.referral_codes rc
        WHERE rc.user_id = p.referred_by AND rc.is_active = true LIMIT 1),
       0, false
FROM public.profiles p
WHERE p.referred_by IS NOT NULL
  AND p.referred_by <> p.id
  AND NOT EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions t
                  WHERE t.source_user_id = p.id AND t.type = 'referral_bonus')
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.referred_by AND ur.role::text = 'founding_member')
ON CONFLICT (referred_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Payout: explicit invites only, remembers the order that paid it
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_simple_referral(uuid);

CREATE OR REPLACE FUNCTION public.process_simple_referral(p_referred_user_id uuid, p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral referrals%ROWTYPE;
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
  IF NOT FOUND OR coalesce(v_referral.incentive_paid, false) THEN RETURN; END IF;
  IF v_referral.referrer_id IS NULL OR v_referral.referrer_id = p_referred_user_id THEN RETURN; END IF;

  -- Same lock as the MLM payout, so the two can never both pay one invitee.
  PERFORM pg_advisory_xact_lock(hashtext('process_mlm_referral:' || p_referred_user_id::text));

  -- Already rewarded, under either scheme. A referral bonus that was taken
  -- back on cancellation (matching 'reversal:<order>' entry) doesn't count.
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = p_referred_user_id AND incentive_paid)
     OR EXISTS (SELECT 1 FROM wallet_transactions t
                WHERE t.source_user_id = p_referred_user_id AND t.type = 'referral_bonus'
                  AND NOT EXISTS (SELECT 1 FROM wallet_transactions rv
                                  WHERE rv.source_user_id = p_referred_user_id
                                    AND rv.reference_id = 'reversal:' || t.reference_id)) THEN
    RETURN;
  END IF;

  SELECT value INTO v_settings FROM platform_settings WHERE key = 'referral_scheme_settings';
  v_referrer_bonus := GREATEST(coalesce((v_settings ->> 'referrer_bonus')::numeric, 0), 0);
  v_welcome_bonus := GREATEST(coalesce((v_settings ->> 'welcome_bonus')::numeric, 0), 0);

  v_code_id := v_referral.referral_code_id;
  IF v_code_id IS NULL THEN
    SELECT id INTO v_code_id FROM referral_codes
    WHERE user_id = v_referral.referrer_id AND is_active = true LIMIT 1;
  END IF;

  UPDATE referrals
  SET incentive_paid = true,
      incentive_amount = v_referrer_bonus,
      referral_code_id = v_code_id,
      reward_order_id = p_order_id
  WHERE id = v_referral.id;

  IF v_code_id IS NOT NULL THEN
    UPDATE referral_codes SET usage_count = coalesce(usage_count, 0) + 1 WHERE id = v_code_id;
  END IF;
  UPDATE profiles SET referral_count = coalesce(referral_count, 0) + 1 WHERE id = v_referral.referrer_id;

  IF v_referrer_bonus > 0 THEN
    v_wallet_id := ensure_user_wallet(v_referral.referrer_id);
    IF v_wallet_id IS NOT NULL THEN
      UPDATE wallets
      SET balance = balance + v_referrer_bonus,
          purchase_only_balance = purchase_only_balance + v_referrer_bonus,
          updated_at = now()
      WHERE id = v_wallet_id
      RETURNING balance INTO v_balance;

      INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, source_user_id, is_withdrawable, reference_id)
      VALUES (v_wallet_id, 'referral_bonus', v_referrer_bonus, v_balance,
              'Referral bonus - your invitee placed their first order', p_referred_user_id, false, p_order_id::text);

      INSERT INTO notifications (user_id, type, title, message)
      VALUES (v_referral.referrer_id, 'earning', 'Referral Bonus Earned',
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

      INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, is_withdrawable, reference_id)
      VALUES (v_wallet_id, 'credit', v_welcome_bonus, v_balance,
              'Welcome bonus for joining with an invite code', false, p_order_id::text);

      INSERT INTO notifications (user_id, type, title, message)
      VALUES (p_referred_user_id, 'earning', 'Welcome Bonus',
              '₹' || v_welcome_bonus || ' welcome bonus added to your wallet. Use it on your next order!');
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.process_simple_referral(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reversal when the paying order is cancelled or returned
-- ---------------------------------------------------------------------------
-- Takes back up to p_amount from the wallet's purchase-only money (never below
-- zero) and returns how much was actually taken.
CREATE OR REPLACE FUNCTION public.take_back_simple_bonus(
  p_wallet_id uuid, p_amount numeric, p_order_id uuid, p_referred_user_id uuid, p_description text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_take numeric;
  v_balance numeric;
BEGIN
  IF p_wallet_id IS NULL OR coalesce(p_amount, 0) <= 0 THEN RETURN 0; END IF;

  SELECT LEAST(p_amount, GREATEST(purchase_only_balance, 0), GREATEST(balance, 0))
  INTO v_take FROM wallets WHERE id = p_wallet_id FOR UPDATE;
  IF coalesce(v_take, 0) <= 0 THEN RETURN 0; END IF;

  UPDATE wallets
  SET balance = balance - v_take,
      purchase_only_balance = purchase_only_balance - v_take,
      updated_at = now()
  WHERE id = p_wallet_id
  RETURNING balance INTO v_balance;

  INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, source_user_id, is_withdrawable, reference_id)
  VALUES (p_wallet_id, 'debit', v_take, v_balance, p_description, p_referred_user_id, false, 'reversal:' || p_order_id::text);

  RETURN v_take;
END;
$$;
REVOKE ALL ON FUNCTION public.take_back_simple_bonus(uuid, numeric, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reverse_simple_referral(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral referrals%ROWTYPE;
  v_referrer_wallet uuid;
  v_invitee_wallet uuid;
  v_referrer_paid numeric := 0;
  v_welcome_paid numeric := 0;
  v_referrer_back numeric := 0;
  v_welcome_back numeric := 0;
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_referral FROM referrals WHERE reward_order_id = p_order_id AND incentive_paid;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('process_mlm_referral:' || v_referral.referred_id::text));
  -- Re-check under the lock (a concurrent reversal may have finished).
  SELECT * INTO v_referral FROM referrals WHERE id = v_referral.id AND reward_order_id = p_order_id AND incentive_paid;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT id INTO v_referrer_wallet FROM wallets WHERE user_id = v_referral.referrer_id;
  SELECT id INTO v_invitee_wallet FROM wallets WHERE user_id = v_referral.referred_id;

  SELECT coalesce(sum(amount), 0) INTO v_referrer_paid FROM wallet_transactions
  WHERE wallet_id = v_referrer_wallet AND type = 'referral_bonus'
    AND source_user_id = v_referral.referred_id AND reference_id = p_order_id::text;
  SELECT coalesce(sum(amount), 0) INTO v_welcome_paid FROM wallet_transactions
  WHERE wallet_id = v_invitee_wallet AND type = 'credit' AND reference_id = p_order_id::text
    AND description = 'Welcome bonus for joining with an invite code';

  v_referrer_back := take_back_simple_bonus(v_referrer_wallet, v_referrer_paid, p_order_id, v_referral.referred_id,
    'Referral bonus reversed - your invitee''s first order was cancelled');
  v_welcome_back := take_back_simple_bonus(v_invitee_wallet, v_welcome_paid, p_order_id, v_referral.referred_id,
    'Welcome bonus reversed - your first order was cancelled');

  IF v_referrer_back > 0 THEN
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (v_referral.referrer_id, 'wallet', 'Referral Bonus Reversed',
            '₹' || v_referrer_back || ' referral bonus was taken back because your invitee''s first order was cancelled. You will get it again when they complete an order.');
  END IF;
  IF v_welcome_back > 0 THEN
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (v_referral.referred_id, 'wallet', 'Welcome Bonus Reversed',
            '₹' || v_welcome_back || ' welcome bonus was taken back because your first order was cancelled. You will get it again when you complete an order.');
  END IF;

  IF v_referrer_back >= v_referrer_paid AND v_welcome_back >= v_welcome_paid THEN
    -- Fully taken back: re-arm, so the next successful paid order pays again.
    UPDATE referrals SET incentive_paid = false, incentive_amount = 0, reward_order_id = NULL
    WHERE id = v_referral.id;
    UPDATE referral_codes SET usage_count = GREATEST(coalesce(usage_count, 0) - 1, 0)
    WHERE id = v_referral.referral_code_id;
    UPDATE profiles SET referral_count = GREATEST(coalesce(referral_count, 0) - 1, 0)
    WHERE id = v_referral.referrer_id;
  ELSE
    -- Some of it was already spent: keep the invite closed so it can't be
    -- paid twice.
    UPDATE referrals SET reward_order_id = NULL WHERE id = v_referral.id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_simple_referral(uuid) FROM PUBLIC, anon, authenticated;

-- Same as 20261012000000, plus the cancellation branch and the order id.
CREATE OR REPLACE FUNCTION public.trigger_invite_reward_on_first_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  -- The order that paid the simple-scheme bonuses was cancelled or returned:
  -- take them back (whatever the current scheme).
  IF TG_OP = 'UPDATE' AND NEW.status::text IN ('cancelled', 'returned')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      PERFORM public.reverse_simple_referral(NEW.id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'simple referral reversal failed for order %: %', NEW.id, SQLERRM;
    END;
    RETURN NULL;
  END IF;

  IF NOT (
    (TG_OP = 'INSERT' AND NEW.payment_status = 'completed') OR
    (TG_OP = 'UPDATE' AND NEW.payment_status = 'completed' AND OLD.payment_status IS DISTINCT FROM 'completed') OR
    (TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
  ) THEN
    RETURN NULL;
  END IF;

  -- Simple scheme: an unpaid invite is paid on this order. A cancelled or
  -- returned order never pays. A reward problem must never block an order.
  IF public.simple_referral_scheme_active() THEN
    IF coalesce(NEW.status::text, '') IN ('cancelled', 'returned') THEN
      RETURN NULL;
    END IF;
    BEGIN
      PERFORM public.process_simple_referral(NEW.user_id, NEW.id);
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

COMMIT;
