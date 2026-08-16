CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(p_order_id uuid, p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order RECORD;
  v_wallet_id uuid;
  v_purchase numeric;
  v_withdrawable numeric;
  v_balance numeric;
  v_use_purchase numeric;
  v_use_withdrawable numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', true, 'charged', 0);
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_uid IS NULL OR (v_order.user_id <> v_uid AND NOT public.is_any_admin(v_uid)) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- idempotency: already charged for this order
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE reference_id = p_order_id AND type = 'purchase'
  ) THEN
    RETURN json_build_object('success', true, 'charged', 0, 'already_charged', true);
  END IF;

  v_wallet_id := public.ensure_user_wallet(v_order.user_id);

  SELECT balance, COALESCE(purchase_only_balance,0), COALESCE(withdrawable_balance,0)
    INTO v_balance, v_purchase, v_withdrawable
  FROM wallets WHERE id = v_wallet_id FOR UPDATE;

  IF COALESCE(v_balance,0) < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  v_use_purchase := LEAST(v_purchase, p_amount);
  v_use_withdrawable := p_amount - v_use_purchase;

  IF v_use_withdrawable > v_withdrawable THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  UPDATE wallets SET
    balance = balance - p_amount,
    purchase_only_balance = purchase_only_balance - v_use_purchase,
    withdrawable_balance = withdrawable_balance - v_use_withdrawable,
    updated_at = now()
  WHERE id = v_wallet_id
  RETURNING balance INTO v_balance;

  INSERT INTO wallet_transactions (
    wallet_id, type, amount, balance_after, description, reference_id, is_withdrawable
  ) VALUES (
    v_wallet_id, 'purchase', p_amount, v_balance,
    'Wallet payment for order ' || v_order.order_number,
    p_order_id, v_use_withdrawable > 0
  );

  -- fully covered by wallet => order is paid, not COD
  IF COALESCE(v_order.total_amount,0) <= 0 THEN
    UPDATE orders SET
      payment_status = 'completed',
      is_cod = false,
      cod_amount = 0,
      updated_at = now()
    WHERE id = p_order_id;
  END IF;

  RETURN json_build_object('success', true, 'charged', p_amount, 'balance', v_balance);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid, numeric) TO service_role;