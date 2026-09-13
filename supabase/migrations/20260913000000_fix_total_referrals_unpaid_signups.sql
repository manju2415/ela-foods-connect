-- get_network_admin_stats.total_referrals previously did `count(*) FROM
-- public.referrals` with no filter. Since add-network-user started inserting
-- a pending public.referrals row (incentive_paid = false) as soon as an admin
-- adds a member — before that person ever pays the registration fee — this
-- counted every pending/unpaid signup as a real referral, not just people who
-- actually completed registration. That inflated "Total Referrals" on the
-- admin Network Analytics page for anyone using the "Add Network User" flow.
--
-- Fixed to match the same rule already used by get_my_member_network (see
-- 20260911000000_member_network_and_invitations.sql): a referral only counts
-- once the referred profile has actually paid (registration_fee_paid > 0).
-- Using referrals.incentive_paid instead would be wrong here — it also gets
-- set to false for some real, paid referrals where a bonus was intentionally
-- not credited (see supabase/add_referrals_row_gokul_shyju.sql), so it is not
-- a reliable proxy for "did this person actually join."
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
    SELECT count(*) AS total_referrals
    FROM public.referrals r
    JOIN public.profiles rp ON rp.id = r.referred_id
    WHERE coalesce(rp.registration_fee_paid, 0) > 0
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
