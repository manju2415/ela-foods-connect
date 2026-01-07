-- Create withdrawal requests table
CREATE TABLE public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_account_holder TEXT,
  notes TEXT,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own withdrawal requests"
ON public.withdrawal_requests FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own withdrawal requests"
ON public.withdrawal_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all withdrawal requests"
ON public.withdrawal_requests FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update withdrawal requests"
ON public.withdrawal_requests FOR UPDATE
USING (is_admin(auth.uid()));

-- Create function to request withdrawal
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS JSON
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
  -- Get wallet and check balance
  SELECT id, withdrawable_balance INTO v_wallet_id, v_withdrawable_balance
  FROM wallets WHERE user_id = p_user_id;
  
  IF v_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  
  IF v_withdrawable_balance < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient withdrawable balance');
  END IF;
  
  -- Get user bank details
  SELECT bank_name, bank_account_number, bank_ifsc, bank_account_holder
  INTO v_profile
  FROM profiles WHERE id = p_user_id;
  
  IF v_profile.bank_account_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Please add bank details first');
  END IF;
  
  -- Create withdrawal request
  INSERT INTO withdrawal_requests (
    user_id, amount, bank_name, bank_account_number, bank_ifsc, bank_account_holder
  ) VALUES (
    p_user_id, p_amount, v_profile.bank_name, v_profile.bank_account_number, 
    v_profile.bank_ifsc, v_profile.bank_account_holder
  ) RETURNING id INTO v_request_id;
  
  -- Deduct from withdrawable balance (hold the amount)
  UPDATE wallets SET 
    withdrawable_balance = withdrawable_balance - p_amount,
    balance = balance - p_amount,
    updated_at = now()
  WHERE id = v_wallet_id;
  
  -- Add wallet transaction
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

-- Create function to process withdrawal (admin)
CREATE OR REPLACE FUNCTION public.process_withdrawal(
  p_request_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_wallet_id UUID;
BEGIN
  -- Get request
  SELECT * INTO v_request FROM withdrawal_requests WHERE id = p_request_id;
  
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  
  IF v_request.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Request already processed');
  END IF;
  
  -- Update request
  UPDATE withdrawal_requests SET
    status = p_status,
    notes = COALESCE(p_notes, notes),
    processed_by = p_admin_id,
    processed_at = now(),
    updated_at = now()
  WHERE id = p_request_id;
  
  -- If rejected, refund the amount
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
      'Withdrawal request rejected - refunded',
      true,
      p_request_id
    );
  END IF;
  
  -- Create notification
  PERFORM create_notification(
    v_request.user_id,
    CASE WHEN p_status = 'approved' THEN 'Withdrawal Approved' 
         WHEN p_status = 'rejected' THEN 'Withdrawal Rejected'
         ELSE 'Withdrawal Update' END,
    CASE WHEN p_status = 'approved' THEN 'Your withdrawal of ₹' || v_request.amount || ' has been approved.'
         WHEN p_status = 'rejected' THEN 'Your withdrawal request was rejected. Amount refunded to wallet.'
         ELSE 'Your withdrawal status has been updated.' END,
    'wallet',
    p_request_id
  );
  
  RETURN json_build_object('success', true);
END;
$$;