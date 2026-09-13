-- Read-only: finds referrals rows where the recorded referrer does NOT match
-- the actual owner of the referral_code that was used (the add-network-user
-- bug — it credited whoever was logged in, not the code's real owner).
SELECT r.id AS referral_row_id,
       r.referrer_id AS wrongly_recorded_referrer,
       wrong.full_name AS wrongly_recorded_referrer_name,
       rc.user_id AS actual_code_owner_id,
       owner.full_name AS actual_code_owner_name,
       owner.phone AS actual_code_owner_phone,
       rc.code,
       r.referred_id,
       new_user.full_name AS new_user_name,
       new_user.phone AS new_user_phone,
       r.created_at
FROM public.referrals r
JOIN public.referral_codes rc ON rc.id = r.referral_code_id
JOIN public.profiles wrong ON wrong.id = r.referrer_id
JOIN public.profiles owner ON owner.id = rc.user_id
JOIN public.profiles new_user ON new_user.id = r.referred_id
WHERE r.referrer_id <> rc.user_id
ORDER BY r.created_at;
