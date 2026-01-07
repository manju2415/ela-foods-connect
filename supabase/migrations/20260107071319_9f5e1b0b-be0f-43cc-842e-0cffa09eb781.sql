-- Drop the security definer view and recreate as regular view
DROP VIEW IF EXISTS public.user_hierarchy;

-- Recreate as regular view (no SECURITY DEFINER)
CREATE VIEW public.user_hierarchy AS
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.user_level,
  p.referred_by,
  p.referral_count,
  rp.full_name as referred_by_name,
  rp.email as referred_by_email,
  w.balance as total_wallet_balance,
  w.withdrawable_balance,
  w.purchase_only_balance
FROM public.profiles p
LEFT JOIN public.profiles rp ON p.referred_by = rp.id
LEFT JOIN public.wallets w ON p.id = w.user_id;