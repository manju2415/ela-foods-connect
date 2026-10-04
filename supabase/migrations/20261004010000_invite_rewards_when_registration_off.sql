-- Invite rewards while member registration is switched OFF.
--
-- With registration OFF there is no registration fee, so nothing would ever
-- trigger the MLM referral payout. MLM settings stay active instead:
--  * every logged-in user can get an invite code (normally only paid members);
--  * a new user who logs in with an invite code is linked to the inviter
--    (verify-otp-login sets referred_by and a referrals row flagged
--    reward_on_first_order);
--  * on that invitee's first paid order, process_mlm_referral pays the inviter's
--    referral bonus, the upline commissions and the invitee's welcome bonus —
--    all from the MLM settings version that applies to each user, exactly as a
--    paid registration would. Purchase commission keeps working unchanged.
-- With registration ON nothing here changes behaviour: rows are only flagged
-- by the OFF-mode login, and code issuance keeps requiring a paid fee.

BEGIN;

CREATE OR REPLACE FUNCTION public.registration_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Fails open: only an explicit false turns registration off.
  SELECT coalesce(
    (SELECT (value ->> 'registration_enabled')::boolean
     FROM public.platform_settings WHERE key = 'registration_settings'),
    true
  ) IS DISTINCT FROM false;
$$;
GRANT EXECUTE ON FUNCTION public.registration_enabled() TO anon, authenticated, service_role;

-- Same as 20260923000000, except an unpaid user may get a code while
-- registration is OFF.
CREATE OR REPLACE FUNCTION public.generate_user_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_code text;
  v_paid numeric;
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') <> 'service_role'
     AND (auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_any_admin(auth.uid()))) THEN
    RETURN NULL;
  END IF;

  -- Serialize concurrent payment callbacks before checking for an existing code.
  SELECT registration_fee_paid INTO v_paid FROM public.profiles
  WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR (coalesce(v_paid, 0) <= 0 AND public.registration_enabled()) THEN
    RETURN NULL;
  END IF;

  SELECT code INTO v_new_code FROM public.referral_codes
  WHERE user_id = p_user_id AND is_active = true LIMIT 1;
  IF FOUND THEN RETURN v_new_code; END IF;

  LOOP
    v_new_code := public.generate_referral_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_new_code);
  END LOOP;
  INSERT INTO public.referral_codes (user_id, code, is_active)
  VALUES (p_user_id, v_new_code, true);
  RETURN v_new_code;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_user_referral_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_user_referral_code(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_paid_referral_code_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.is_active) AND public.registration_enabled() THEN
    PERFORM 1 FROM public.profiles
    WHERE id = NEW.user_id AND coalesce(registration_fee_paid, 0) > 0
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registration payment is required before issuing a referral code';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_paid_referral_code_owner() FROM PUBLIC;

-- Marks invites made through the registration-OFF login.
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS reward_on_first_order boolean NOT NULL DEFAULT false;

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

DROP TRIGGER IF EXISTS on_order_invite_reward ON public.orders;
CREATE TRIGGER on_order_invite_reward
AFTER INSERT OR UPDATE OF payment_status, status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_invite_reward_on_first_order();

COMMIT;
