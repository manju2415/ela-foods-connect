-- Continuing 20260908020000: two more admin surfaces read profiles/wallets/
-- orders/referrals/withdrawal_requests directly, which RLS restricts to
-- admin/super_admin (is_admin()) — leaving them broken for a pure mlm_admin
-- Network Manager. Both RPCs here are read-only (SECURITY DEFINER, gated by
-- is_any_admin, which already covers mlm_admin) and return only what their
-- one caller renders; no write behaviour changes.

-- UserDashboardViewer.tsx: the "view user" dialog opened from Top Referrers /
-- the network tree. Returns bank details, so access is admin-gated the same
-- as everywhere else those are already surfaced (Users.tsx, Founders.tsx).
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

-- Withdrawals.tsx list view. The approve/reject action already goes through
-- process_withdrawal, which is already is_any_admin()-gated — only the list
-- read was broken for mlm_admin.
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
