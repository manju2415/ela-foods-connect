-- CRITICAL: none of the functions below had EXECUTE revoked from PUBLIC.
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and
-- PostgREST exposes any function the calling role can execute as an RPC — so
-- every one of these was reachable by a fully anonymous request, confirmed
-- directly against the live project. In practice this meant anyone, without
-- logging in, could credit or debit any wallet by any amount
-- (add_wallet_transaction), open a withdrawal hold against another user's
-- wallet (request_withdrawal), or approve/reject/mark-paid any withdrawal
-- request as if they were an admin (process_withdrawal), or credit referral
-- and purchase-commission bonuses with no real order/payment/referrer behind
-- them (credit_purchase_commission, process_mlm_referral).

-- Internal helper only ever invoked from other SECURITY DEFINER functions
-- (which keep working: a function's internal calls run as its owner,
-- unaffected by revoking PUBLIC/anon/authenticated). Never meant to be
-- called directly by a client.
REVOKE ALL ON FUNCTION public.add_wallet_transaction(uuid, numeric, wallet_transaction_type, text, uuid) FROM PUBLIC;

-- Only ever invoked from the order-commission trigger with a real order
-- behind it. A direct client call could fabricate commission with no
-- purchase at all.
REVOKE ALL ON FUNCTION public.credit_purchase_commission(uuid, numeric) FROM PUBLIC;

-- Only ever invoked from process-registration-payment after a payment is
-- independently verified. A direct client call could pay referral/welcome
-- bonuses for a "registration" with no payment behind it.
REVOKE ALL ON FUNCTION public.process_mlm_referral(text, uuid, numeric) FROM PUBLIC;

-- request_withdrawal is meant to be self-service, but never checked that the
-- caller actually was p_user_id, so any caller could open a withdrawal hold
-- against another user's wallet (using that user's own saved bank details —
-- it doesn't let an attacker redirect the payout, but it does let anyone
-- drain a stranger's withdrawable balance into pending holds). It also read
-- the balance without locking the wallet row first.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id uuid,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_withdrawable_balance NUMERIC;
  v_profile RECORD;
  v_request_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  SELECT id, withdrawable_balance INTO v_wallet_id, v_withdrawable_balance
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_withdrawable_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient withdrawable balance');
  END IF;

  SELECT bank_name, bank_account_number, bank_ifsc, bank_account_holder
  INTO v_profile
  FROM profiles WHERE id = p_user_id;

  IF v_profile.bank_account_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Please add bank details first');
  END IF;

  INSERT INTO withdrawal_requests (
    user_id, amount, bank_name, bank_account_number, bank_ifsc, bank_account_holder
  ) VALUES (
    p_user_id, p_amount, v_profile.bank_name, v_profile.bank_account_number,
    v_profile.bank_ifsc, v_profile.bank_account_holder
  ) RETURNING id INTO v_request_id;

  UPDATE wallets SET
    withdrawable_balance = withdrawable_balance - p_amount,
    balance = balance - p_amount,
    updated_at = now()
  WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (
    wallet_id, type, amount, balance_after, description, is_withdrawable, reference_id
  ) VALUES (
    v_wallet_id, 'debit', p_amount,
    (SELECT balance FROM wallets WHERE id = v_wallet_id),
    'Withdrawal request - pending approval',
    true,
    v_request_id
  );

  RETURN json_build_object('success', true, 'request_id', v_request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_withdrawal(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric) TO authenticated;

-- process_withdrawal must only ever run for an actual admin — it had no
-- internal check at all, relying entirely on whatever called it to have
-- already verified that, which nothing enforced for a direct RPC call. It
-- also read the request's status without locking the row, so two concurrent
-- calls (a double click, two admins, or a deliberate race) could both see
-- "pending" and both take the rejected-refund branch, crediting the wallet
-- twice for one request. The superseded 4-parameter overload (predating
-- payment_reference/payment_method/paid_at) is dropped so only one version
-- exists to reason about. processed_by now always records the actual caller
-- rather than a client-supplied p_admin_id, which could previously name any
-- other admin.
DROP FUNCTION IF EXISTS public.process_withdrawal(uuid, text, text, uuid);

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
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_wallet_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_any_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests WHERE id = p_request_id FOR UPDATE;

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
    processed_by = auth.uid(),
    processed_at = now(),
    payment_reference = COALESCE(p_payment_reference, payment_reference),
    payment_method = COALESCE(p_payment_method, payment_method),
    paid_at = CASE WHEN p_status = 'paid' THEN COALESCE(p_paid_at, now()) ELSE paid_at END,
    updated_at = now()
  WHERE id = p_request_id;

  IF p_status = 'rejected' THEN
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_request.user_id FOR UPDATE;

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
REVOKE ALL ON FUNCTION public.process_withdrawal(uuid, text, text, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(uuid, text, text, uuid, text, text, timestamptz) TO authenticated;
