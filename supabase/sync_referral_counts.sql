-- Syncs profiles.referral_count to the real row count in public.referrals for
-- every account where they disagree (the 11 found by audit_referral_count_mismatch.sql).
-- Note: for Shyju and Manoj Kumar this crosses the 10-referral bonus-tier
-- threshold used by process_mlm_referral, so their NEXT new referral will pay
-- the "beyond 10" bonus (Rs 200) instead of "first 10" (Rs 500). This does not
-- change any bonus already paid historically.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

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

-- Verify: should return no rows if everything is now in sync
SELECT p.id, p.full_name, p.referral_count AS stored_referral_count, count(r.id) AS actual_referrals_rows
FROM public.profiles p
LEFT JOIN public.referrals r ON r.referrer_id = p.id
GROUP BY p.id, p.full_name, p.referral_count
HAVING p.referral_count IS DISTINCT FROM count(r.id);

COMMIT;
