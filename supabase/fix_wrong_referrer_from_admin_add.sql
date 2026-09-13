-- Corrects the 11 referrals mis-attributed to Super Admin by the add-network-user
-- bug (it credited whoever was logged in instead of the selected referral
-- code's actual owner). No wallet/commission changes — this only corrects the
-- mapping and referral counts, matching how we handled Gokul MD earlier.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

-- 1. Fix profiles.referred_by for each wrongly-attributed new user
UPDATE public.profiles p
SET referred_by = rc.user_id
FROM public.referrals r
JOIN public.referral_codes rc ON rc.id = r.referral_code_id
WHERE p.id = r.referred_id
  AND r.referrer_id <> rc.user_id;

-- 2. Fix the referrals table itself to credit the real code owner
UPDATE public.referrals r
SET referrer_id = rc.user_id
FROM public.referral_codes rc
WHERE rc.id = r.referral_code_id
  AND r.referrer_id <> rc.user_id;

-- 3. Re-sync referral_count now that referrer_id has moved for these rows
UPDATE public.profiles p
SET referral_count = sub.actual_count
FROM (
  SELECT p2.id, count(r.id) AS actual_count
  FROM public.profiles p2
  LEFT JOIN public.referrals r ON r.referrer_id = p2.id
  GROUP BY p2.id
) sub
WHERE p.id = sub.id
  AND p.referral_count IS DISTINCT FROM sub.actual_count;

-- Verify: should return no rows
SELECT r.id, r.referrer_id, rc.user_id AS code_owner
FROM public.referrals r
JOIN public.referral_codes rc ON rc.id = r.referral_code_id
WHERE r.referrer_id <> rc.user_id;

COMMIT;
