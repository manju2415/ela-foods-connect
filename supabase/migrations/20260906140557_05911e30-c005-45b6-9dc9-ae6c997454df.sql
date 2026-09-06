-- Supabase default privileges re-grant EXECUTE to anon/authenticated on every
-- newly created function in public, so REVOKE ... FROM PUBLIC is not enough.
-- Revoke the explicit role grants as well.

-- Internal-only helpers: no client should call these at all.
REVOKE EXECUTE ON FUNCTION public.add_wallet_transaction(uuid, numeric, wallet_transaction_type, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_purchase_commission(uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_mlm_referral(text, uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_founder_commission(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_referral_incentive(text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_order_invoice(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_registration_invoice(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_paid_order_stock(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_user_wallet(uuid) FROM anon;

-- Self-service / admin RPCs: signed-in only (each checks the caller itself).
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_withdrawal(uuid, text, text, uuid, text, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_downline(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_user_referral_code(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pay_order_with_wallet(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order_atomic(uuid,jsonb,jsonb,text,uuid,text,boolean,text,date,uuid,text) FROM anon;