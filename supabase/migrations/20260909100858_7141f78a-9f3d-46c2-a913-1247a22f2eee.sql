CREATE OR REPLACE FUNCTION public.get_network_admin_stats()
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

  WITH founder_ids AS (
    SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'founding_member'
  ),
  profile_counts AS (
    SELECT
      count(*) AS total_users,
      count(*) FILTER (WHERE p.id IN (SELECT user_id FROM founder_ids)) AS founders,
      count(*) FILTER (WHERE p.user_level = 'master' AND p.id NOT IN (SELECT user_id FROM founder_ids)) AS masters,
      count(*) FILTER (WHERE p.user_level = 'associate' AND p.id NOT IN (SELECT user_id FROM founder_ids)) AS associates,
      coalesce(sum(p.registration_fee_paid), 0) AS registration_fees
    FROM public.profiles p
  ),
  wallet_totals AS (
    SELECT
      coalesce(sum(balance), 0) AS total_balance,
      coalesce(sum(withdrawable_balance), 0) AS total_withdrawable,
      coalesce(sum(purchase_only_balance), 0) AS total_purchase_only
    FROM public.wallets
  ),
  referral_totals AS (
    SELECT count(*) AS total_referrals FROM public.referrals
  ),
  code_totals AS (
    SELECT count(*) AS referral_codes FROM public.referral_codes
  ),
  withdrawal_totals AS (
    SELECT count(*) AS pending_withdrawals FROM public.withdrawal_requests WHERE status = 'pending'
  )
  SELECT jsonb_build_object(
    'total_users', pc.total_users,
    'founders', pc.founders,
    'masters', pc.masters,
    'associates', pc.associates,
    'total_referrals', rt.total_referrals,
    'referral_codes', ct.referral_codes,
    'total_wallet_balance', wt.total_balance,
    'total_withdrawable', wt.total_withdrawable,
    'total_purchase_only', wt.total_purchase_only,
    'registration_fees_collected', pc.registration_fees,
    'pending_withdrawals', wd.pending_withdrawals
  )
  INTO v_result
  FROM profile_counts pc, wallet_totals wt, referral_totals rt, code_totals ct, withdrawal_totals wd;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_network_admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_network_admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_top_referrers(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  referral_count integer,
  user_level public.user_level
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.referral_count, p.user_level
  FROM public.profiles p
  WHERE p.referral_count > 0
  ORDER BY p.referral_count DESC
  LIMIT LEAST(coalesce(p_limit, 10), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.get_top_referrers(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_referrers(integer) TO authenticated;

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
          'user_level', rp.user_level
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

REVOKE ALL ON FUNCTION public.get_user_dashboard_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_details(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_withdrawal_requests_admin()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  amount numeric,
  status text,
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_account_holder text,
  notes text,
  created_at timestamptz,
  processed_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  payment_method text,
  profile_email text,
  profile_full_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    w.id, w.user_id, w.amount, w.status, w.bank_name, w.bank_account_number,
    w.bank_ifsc, w.bank_account_holder, w.notes, w.created_at, w.processed_at,
    w.paid_at, w.payment_reference, w.payment_method,
    p.email, p.full_name
  FROM public.withdrawal_requests w
  LEFT JOIN public.profiles p ON p.id = w.user_id
  ORDER BY w.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_requests_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_requests_admin() TO authenticated;