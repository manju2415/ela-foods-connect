-- The Network Manager portal (/mlm-admin/*) reuses the same dashboard and
-- analytics components as the super-admin portal (/admin/network-admin,
-- /admin/network-analytics), but a pure mlm_admin (not also admin/
-- super_admin) gets almost all-zero numbers there: those components query
-- profiles/wallets/referrals directly, and the RLS policies granting broad
-- read access on those tables only recognise is_admin() (admin/super_admin),
-- not mlm_admin. Rather than widen RLS and hand every mlm_admin raw SELECT
-- access to all users' profiles and wallets, these two RPCs return only the
-- aggregate counts/lists the dashboards actually render, gated by
-- is_any_admin() (which already includes mlm_admin alongside admin and
-- super_admin — see 20260815030218_...). Super-admin behaviour is
-- unchanged: same numbers, just fetched through the RPC instead of five
-- separate direct queries.
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
