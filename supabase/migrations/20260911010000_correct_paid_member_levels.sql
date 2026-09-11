BEGIN;

-- A paid member is an Associate until a direct referral pays. Founders retain
-- their designated level. Unpaid accounts have no membership level in the UI.
CREATE OR REPLACE FUNCTION public.enforce_paid_member_level()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_level = 'founder' OR coalesce(NEW.is_designated_founder, false)
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'founding_member') THEN
    RETURN NEW;
  END IF;
  NEW.user_level := CASE
    WHEN coalesce(NEW.registration_fee_paid, 0) > 0 AND EXISTS (
      SELECT 1 FROM public.profiles child
      WHERE child.referred_by = NEW.id AND child.id <> NEW.id
        AND coalesce(child.registration_fee_paid, 0) > 0
    ) THEN 'master'::public.user_level
    ELSE 'associate'::public.user_level
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_paid_member_level() FROM PUBLIC;

CREATE TRIGGER zz_enforce_paid_member_level
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_paid_member_level();

CREATE OR REPLACE FUNCTION public.refresh_paid_referrer_level()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Updating only the level cannot re-enter this trigger. Lock the referrer row
  -- so concurrent registrations serialize their promotion checks.
  IF TG_OP <> 'INSERT' AND OLD.referred_by IS NOT NULL THEN
    UPDATE public.profiles SET user_level = user_level WHERE id = OLD.referred_by;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.referred_by IS NOT NULL THEN
    UPDATE public.profiles SET user_level = user_level WHERE id = NEW.referred_by;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_paid_referrer_level() FROM PUBLIC;
CREATE TRIGGER refresh_paid_referrer_level
AFTER INSERT OR DELETE OR UPDATE OF registration_fee_paid, referred_by ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.refresh_paid_referrer_level();

CREATE OR REPLACE FUNCTION public.admin_record_registration_payment(p_user_id uuid, p_amount numeric, p_reference text DEFAULT NULL, p_method text DEFAULT 'manual', p_notes text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_admin uuid:=auth.uid(); v_existing numeric; v_is_founder boolean; v_log_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT public.is_any_admin(v_admin) THEN RETURN json_build_object('success',false,'error','Not authorized'); END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RETURN json_build_object('success',false,'error','Amount must be greater than zero'); END IF;
  IF p_reference IS NULL OR length(trim(p_reference))=0 THEN RETURN json_build_object('success',false,'error','Payment reference is required'); END IF;
  SELECT COALESCE(registration_fee_paid,0),COALESCE(is_designated_founder,false) INTO v_existing,v_is_founder FROM profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('success',false,'error','Member not found'); END IF;
  IF EXISTS(SELECT 1 FROM founder_payment_logs WHERE payment_id=trim(p_reference) AND status='success') THEN RETURN json_build_object('success',false,'error','Payment reference is already recorded'); END IF;
  INSERT INTO founder_payment_logs(user_id,amount,payment_id,status,notes) VALUES(p_user_id,p_amount,trim(p_reference),'success',COALESCE(p_notes,'Recorded manually by admin ('||COALESCE(p_method,'manual')||')')) RETURNING id INTO v_log_id;
  PERFORM ensure_user_wallet(p_user_id);
  UPDATE profiles SET registration_fee_paid=GREATEST(COALESCE(registration_fee_paid,0),p_amount),user_level=CASE WHEN v_is_founder THEN 'founder'::user_level WHEN coalesce(registration_fee_paid,0)=0 THEN 'associate'::user_level ELSE user_level END,founder_status=CASE WHEN v_is_founder THEN 'active' ELSE founder_status END,updated_at=now() WHERE id=p_user_id;
  INSERT INTO user_roles(user_id,role) VALUES(p_user_id,CASE WHEN v_is_founder THEN 'founding_member'::app_role ELSE 'member'::app_role END) ON CONFLICT(user_id,role) DO NOTHING;
  PERFORM credit_pending_referral_for_user(p_user_id);
  PERFORM generate_user_referral_code(p_user_id);
  PERFORM issue_registration_invoice(v_log_id);
  PERFORM create_notification(p_user_id,'Registration Payment Recorded','Your registration payment of ₹'||round(p_amount,2)||' has been recorded. Your membership is active and your GST invoice is available.','success','registration_payment',v_log_id);
  RETURN json_build_object('success',true,'invoice_id',issue_registration_invoice(v_log_id));
END;
$$;

-- Reconcile existing non-founder levels without using invitation/referral counts.
ALTER TABLE public.profiles DISABLE TRIGGER trg_profiles_activation_referral;
UPDATE public.profiles p SET user_level = p.user_level
WHERE p.user_level IS DISTINCT FROM 'founder'
  AND NOT coalesce(p.is_designated_founder, false)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'founding_member');
ALTER TABLE public.profiles ENABLE TRIGGER trg_profiles_activation_referral;

CREATE OR REPLACE FUNCTION public.get_user_dashboard_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT to_jsonb(p) FROM (
        SELECT id, email, full_name, phone, user_level, referral_count,
               registration_fee_paid, created_at, referred_by,
               bank_name, bank_account_number, bank_account_holder, bank_ifsc
        FROM public.profiles WHERE id = p_user_id
      ) p
    ),
    'wallet', (
      SELECT to_jsonb(w) FROM (
        SELECT balance, withdrawable_balance, purchase_only_balance
        FROM public.wallets WHERE user_id = p_user_id
      ) w
    ),
    'orders', (
      SELECT coalesce(jsonb_agg(o), '[]'::jsonb) FROM (
        SELECT id, order_number, status, total_amount, created_at
        FROM public.orders WHERE user_id = p_user_id
        ORDER BY created_at DESC LIMIT 10
      ) o
    ),
    'referrals', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'created_at', r.created_at,
        'referred_profile', jsonb_build_object(
          'full_name', rp.full_name,
          'email', rp.email,
          'user_level', rp.user_level,
          'registration_fee_paid', rp.registration_fee_paid
        )
      )), '[]'::jsonb)
      FROM (
        SELECT id, created_at, referred_id FROM public.referrals
        WHERE referrer_id = p_user_id
        ORDER BY created_at DESC LIMIT 20
      ) r
      LEFT JOIN public.profiles rp ON rp.id = r.referred_id
    ),
    'referrer_name', (
      SELECT coalesce(rp.full_name, rp.email)
      FROM public.profiles p2
      LEFT JOIN public.profiles rp ON rp.id = p2.referred_by
      WHERE p2.id = p_user_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

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
    SELECT p.id as user_id, p.email, p.full_name, CASE WHEN coalesce(p.registration_fee_paid, 0) > 0 THEN p.user_level ELSE NULL::public.user_level END, 1 as level_depth, p.referred_by
    FROM profiles p
    WHERE p.referred_by = p_user_id

    UNION ALL

    SELECT p.id, p.email, p.full_name, CASE WHEN coalesce(p.registration_fee_paid, 0) > 0 THEN p.user_level ELSE NULL::public.user_level END, d.level_depth + 1, p.referred_by
    FROM profiles p
    INNER JOIN downline d ON p.referred_by = d.user_id
    WHERE d.level_depth < 10
  )
  SELECT * FROM downline ORDER BY level_depth, full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_network_roots()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  user_level text,
  referral_count integer,
  referred_by uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    CASE WHEN coalesce(p.registration_fee_paid, 0) > 0 THEN p.user_level::text ELSE 'No role' END,
    p.referral_count,
    p.referred_by
  FROM profiles p
  WHERE p.referred_by IS NULL AND public.is_any_admin(auth.uid())
  ORDER BY p.referral_count DESC, p.created_at ASC;
$$;
REVOKE ALL ON FUNCTION public.get_network_roots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_network_roots() TO authenticated;
COMMIT;
