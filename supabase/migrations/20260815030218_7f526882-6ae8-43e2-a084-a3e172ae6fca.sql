
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_method text;

CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin','mlm_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_bucket text,
  p_direction text,
  p_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_wallet_id uuid;
  v_balance numeric;
  v_withdrawable numeric;
  v_purchase numeric;
  v_delta numeric;
BEGIN
  IF v_admin IS NULL OR NOT public.is_any_admin(v_admin) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;
  IF p_bucket NOT IN ('withdrawable','purchase_only') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid bucket');
  END IF;
  IF p_direction NOT IN ('credit','debit') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid direction');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Reason is required');
  END IF;

  v_wallet_id := public.ensure_user_wallet(p_user_id);
  IF v_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  SELECT balance, withdrawable_balance, purchase_only_balance
    INTO v_balance, v_withdrawable, v_purchase
  FROM wallets WHERE id = v_wallet_id FOR UPDATE;

  v_delta := CASE WHEN p_direction = 'credit' THEN p_amount ELSE -p_amount END;

  IF p_direction = 'debit' THEN
    IF p_bucket = 'withdrawable' AND COALESCE(v_withdrawable,0) < p_amount THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient withdrawable balance');
    END IF;
    IF p_bucket = 'purchase_only' AND COALESCE(v_purchase,0) < p_amount THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient purchase-only balance');
    END IF;
  END IF;

  IF p_bucket = 'withdrawable' THEN
    UPDATE wallets SET
      balance = balance + v_delta,
      withdrawable_balance = withdrawable_balance + v_delta,
      updated_at = now()
    WHERE id = v_wallet_id
    RETURNING balance INTO v_balance;
  ELSE
    UPDATE wallets SET
      balance = balance + v_delta,
      purchase_only_balance = purchase_only_balance + v_delta,
      updated_at = now()
    WHERE id = v_wallet_id
    RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO wallet_transactions (
    wallet_id, type, amount, balance_after, description, is_withdrawable
  ) VALUES (
    v_wallet_id,
    CASE WHEN p_direction = 'credit' THEN 'credit'::wallet_transaction_type ELSE 'debit'::wallet_transaction_type END,
    p_amount, v_balance,
    'Admin adjustment: ' || trim(p_reason),
    p_bucket = 'withdrawable'
  );

  PERFORM create_notification(
    p_user_id,
    CASE WHEN p_direction = 'credit' THEN 'Wallet Credited' ELSE 'Wallet Debited' END,
    '₹' || ROUND(p_amount,2) || ' was ' ||
      CASE WHEN p_direction = 'credit' THEN 'added to' ELSE 'deducted from' END ||
      ' your ' || CASE WHEN p_bucket = 'withdrawable' THEN 'withdrawable' ELSE 'purchase-only' END ||
      ' balance by admin. Reason: ' || trim(p_reason),
    'wallet', NULL, NULL
  );

  RETURN json_build_object('success', true, 'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_registration_payment(
  p_user_id uuid,
  p_amount numeric,
  p_reference text DEFAULT NULL,
  p_method text DEFAULT 'manual',
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_existing numeric;
  v_is_founder boolean;
BEGIN
  IF v_admin IS NULL OR NOT public.is_any_admin(v_admin) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  SELECT COALESCE(registration_fee_paid,0), COALESCE(is_designated_founder,false)
    INTO v_existing, v_is_founder
  FROM profiles WHERE id = p_user_id;

  IF v_existing IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Member not found');
  END IF;

  INSERT INTO founder_payment_logs (user_id, amount, payment_id, status, notes)
  VALUES (p_user_id, p_amount, p_reference, 'success',
          COALESCE(p_notes, 'Recorded manually by admin (' || COALESCE(p_method,'manual') || ')'));

  PERFORM ensure_user_wallet(p_user_id);

  UPDATE profiles SET
    registration_fee_paid = GREATEST(COALESCE(registration_fee_paid,0), p_amount),
    user_level = CASE WHEN v_is_founder THEN 'founder'::user_level
                      WHEN user_level = 'associate' THEN 'master'::user_level
                      ELSE user_level END,
    founder_status = CASE WHEN v_is_founder THEN 'active' ELSE founder_status END,
    updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, CASE WHEN v_is_founder THEN 'founding_member'::app_role ELSE 'member'::app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- idempotent: skips if referral bonus already credited for this user
  PERFORM credit_pending_referral_for_user(p_user_id);

  PERFORM create_notification(
    p_user_id, 'Registration Payment Recorded',
    'Your registration payment of ₹' || ROUND(p_amount,2) || ' has been recorded. Your membership is now active.',
    'success', NULL, NULL
  );

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_request_id uuid,
  p_status text,
  p_notes text DEFAULT NULL::text,
  p_admin_id uuid DEFAULT NULL::uuid,
  p_payment_reference text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_wallet_id UUID;
BEGIN
  SELECT * INTO v_request FROM withdrawal_requests WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF p_status NOT IN ('approved','processing','paid','rejected') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid status');
  END IF;

  IF v_request.status IN ('paid','completed','rejected') THEN
    RETURN json_build_object('success', false, 'error', 'Request already finalised');
  END IF;

  IF p_status = 'rejected' AND v_request.status NOT IN ('pending','approved','processing') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot reject this request');
  END IF;

  UPDATE withdrawal_requests SET
    status = p_status,
    notes = COALESCE(p_notes, notes),
    processed_by = COALESCE(p_admin_id, processed_by),
    processed_at = now(),
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_method = COALESCE(p_payment_method, payment_method),
    paid_at = CASE WHEN p_status = 'paid' THEN COALESCE(p_paid_at, now()) ELSE paid_at END,
    updated_at = now()
  WHERE id = p_request_id;

  IF p_status = 'rejected' THEN
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_request.user_id;

    UPDATE wallets SET
      withdrawable_balance = withdrawable_balance + v_request.amount,
      balance = balance + v_request.amount,
      updated_at = now()
    WHERE id = v_wallet_id;

    INSERT INTO wallet_transactions (
      wallet_id, type, amount, balance_after, description, is_withdrawable, reference_id
    ) VALUES (
      v_wallet_id, 'credit', v_request.amount,
      (SELECT balance FROM wallets WHERE id = v_wallet_id),
      'Withdrawal request rejected - refunded', true, p_request_id
    );
  END IF;

  PERFORM create_notification(
    v_request.user_id,
    CASE p_status
      WHEN 'approved' THEN 'Withdrawal Approved'
      WHEN 'processing' THEN 'Withdrawal Processing'
      WHEN 'paid' THEN 'Withdrawal Paid'
      ELSE 'Withdrawal Rejected' END,
    CASE p_status
      WHEN 'approved' THEN 'Your withdrawal of ₹' || v_request.amount || ' has been approved.'
      WHEN 'processing' THEN 'Your withdrawal of ₹' || v_request.amount || ' is being processed.'
      WHEN 'paid' THEN 'Your withdrawal of ₹' || v_request.amount || ' has been paid'
           || CASE WHEN p_payment_reference IS NOT NULL THEN ' (Ref: ' || p_payment_reference || ')' ELSE '' END || '.'
      ELSE 'Your withdrawal request was rejected. Amount refunded to wallet.' END,
    'wallet', 'withdrawal', p_request_id
  );

  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_record_registration_payment(uuid, numeric, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_registration_payment(uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_any_admin(uuid) TO authenticated;
