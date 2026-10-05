BEGIN;

-- Payment is the membership boundary, including for designated founders.
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
  IF NOT FOUND OR coalesce(v_paid, 0) <= 0 THEN
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

-- Cover direct inserts and reactivation, as well as the code-generation RPC.
CREATE OR REPLACE FUNCTION public.require_paid_referral_code_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.is_active THEN
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
CREATE TRIGGER require_paid_referral_code_owner
BEFORE INSERT OR UPDATE OF user_id, is_active ON public.referral_codes
FOR EACH ROW EXECUTE FUNCTION public.require_paid_referral_code_owner();

-- Preserve historical referral links while invalidating premature codes.
UPDATE public.referral_codes rc SET is_active = false
WHERE rc.is_active AND NOT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = rc.user_id AND coalesce(p.registration_fee_paid, 0) > 0
);

CREATE OR REPLACE FUNCTION public.deactivate_unpaid_referral_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.registration_fee_paid, 0) <= 0 THEN
    UPDATE public.referral_codes SET is_active = false
    WHERE user_id = NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.deactivate_unpaid_referral_codes() FROM PUBLIC;
CREATE TRIGGER deactivate_unpaid_referral_codes
AFTER UPDATE OF registration_fee_paid ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.deactivate_unpaid_referral_codes();

COMMIT;
