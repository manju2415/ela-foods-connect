-- A systematic sweep (comparing every CREATE FUNCTION in this project's
-- migrations against every REVOKE) turned up several more SECURITY DEFINER
-- functions with no REVOKE — same class of bug as the wallet/withdrawal RPCs
-- fixed in the previous migration, confirmed reachable by anonymous requests
-- against the live project the same way.

-- credit_founder_commission pays MLM upline commission for an arbitrary
-- caller-supplied user id with NO idempotency guard at all (unlike
-- process_mlm_referral, which checks wallet_transactions before paying) — it
-- can be called repeatedly for the same real user to keep paying their whole
-- upline chain over and over. It has no legitimate direct caller; it is only
-- ever invoked (via PERFORM, which runs as the owner regardless of this
-- revoke) from process_mlm_referral.
REVOKE ALL ON FUNCTION public.credit_founder_commission(uuid) FROM PUBLIC;

-- process_referral_incentive is legacy code superseded by process_mlm_referral
-- (no longer called from application code) but was still live and callable,
-- and pays a referral bonus for an arbitrary code/user pair with no purchase
-- or registration behind it.
REVOKE ALL ON FUNCTION public.process_referral_incentive(text, uuid) FROM PUBLIC;

-- Invoice generation: not called directly by the frontend (only from
-- triggers and admin_record_registration_payment, both owner-context calls
-- unaffected by this revoke). Direct calls couldn't move money, but could be
-- used to churn invoice numbers or read back another user's invoice id.
REVOKE ALL ON FUNCTION public.next_invoice_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_order_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_registration_invoice(uuid) FROM PUBLIC;

-- get_user_downline is called directly by logged-in members and admins (to
-- view their own network, or any network as an admin), but had no check that
-- the caller was either — anyone could read any user's entire referred-by
-- tree (names and emails) just by knowing their user id.
CREATE OR REPLACE FUNCTION public.get_user_downline(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  user_level user_level,
  level_depth INTEGER,
  referred_by UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Matches the claim-reading fix already applied to place_order_atomic:
  -- PostgREST now only populates the consolidated request.jwt.claims JSON,
  -- not the per-claim request.jwt.claim.role GUC. This must recognise a
  -- service_role caller (edge functions, triggers cascading through other
  -- SECURITY DEFINER functions) as well as the user themselves or an admin —
  -- a plain "auth.uid() IS NULL" check would also let a fully anonymous
  -- request through, since anon calls have no uid either.
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') <> 'service_role'
     AND (auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_any_admin(auth.uid()))) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH RECURSIVE downline AS (
    SELECT p.id as user_id, p.email, p.full_name, p.user_level, 1 as level_depth, p.referred_by
    FROM profiles p
    WHERE p.referred_by = p_user_id

    UNION ALL

    SELECT p.id, p.email, p.full_name, p.user_level, d.level_depth + 1, p.referred_by
    FROM profiles p
    INNER JOIN downline d ON p.referred_by = d.user_id
    WHERE d.level_depth < 10
  )
  SELECT * FROM downline ORDER BY level_depth, full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_downline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_downline(uuid) TO authenticated;

-- generate_user_referral_code is called directly by a logged-in member to
-- generate their own code, but had no check restricting p_user_id to the
-- caller — anyone could generate (and thereby learn) a referral code on
-- behalf of an arbitrary other user.
CREATE OR REPLACE FUNCTION public.generate_user_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
  v_exists BOOLEAN;
  -- Same reasoning as get_user_downline above: must allow service_role
  -- (this runs nested inside process_mlm_referral for a brand-new member,
  -- reached either from a service-role edge function or from an admin's own
  -- session via admin_record_registration_payment) as well as the user
  -- generating their own code.
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') <> 'service_role'
     AND (auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT public.is_any_admin(auth.uid()))) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS(SELECT 1 FROM referral_codes WHERE user_id = p_user_id AND is_active = true)
  INTO v_exists;

  IF v_exists THEN
    SELECT code INTO v_new_code FROM referral_codes WHERE user_id = p_user_id AND is_active = true LIMIT 1;
    RETURN v_new_code;
  END IF;

  LOOP
    v_new_code := generate_referral_code();
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_new_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  INSERT INTO referral_codes (user_id, code, is_active)
  VALUES (p_user_id, v_new_code, true);

  RETURN v_new_code;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_user_referral_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_user_referral_code(uuid) TO authenticated;
