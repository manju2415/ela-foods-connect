-- supabase/sync_referral_counts.sql (already applied) synced profiles.referral_count
-- to `count(*) FROM public.referrals`, with no filter. That was fine at the time,
-- but add-network-user now inserts a pending public.referrals row (incentive_paid
-- = false) as soon as an admin adds a member, before that person ever pays the
-- registration fee. That earlier sync therefore pulled those pending/unpaid
-- signups into referral_count too, which is why users who previously only had
-- their paid referrals counted ("Users with most referrals" on the admin
-- Network Analytics page) suddenly show inflated counts that include people
-- who signed up but never completed registration.
--
-- This corrects referral_count back to counting only referrals where the
-- referred person actually paid (registration_fee_paid > 0) — the same rule
-- get_my_member_network already uses, and the rule the new
-- 20260913000000_fix_total_referrals_unpaid_signups.sql migration applies to
-- the admin "Total Referrals" stat. No wallet/commission changes.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

UPDATE public.profiles p
SET referral_count = sub.actual_count
FROM (
  SELECT p2.id,
         count(*) FILTER (WHERE r.id IS NOT NULL AND coalesce(rp.registration_fee_paid, 0) > 0) AS actual_count
  FROM public.profiles p2
  LEFT JOIN public.referrals r
    ON r.referrer_id = p2.id
  LEFT JOIN public.profiles rp
    ON rp.id = r.referred_id
  GROUP BY p2.id
) sub
WHERE p.id = sub.id
  AND p.referral_count IS DISTINCT FROM sub.actual_count;

-- Verify: should return no rows if everything is now in sync
SELECT p.id, p.full_name, p.referral_count AS stored_referral_count,
       count(r.id) FILTER (WHERE coalesce(rp.registration_fee_paid, 0) > 0) AS actual_paid_referrals
FROM public.profiles p
LEFT JOIN public.referrals r ON r.referrer_id = p.id
LEFT JOIN public.profiles rp ON rp.id = r.referred_id
GROUP BY p.id, p.full_name, p.referral_count
HAVING p.referral_count IS DISTINCT FROM count(r.id) FILTER (WHERE coalesce(rp.registration_fee_paid, 0) > 0);

COMMIT;
