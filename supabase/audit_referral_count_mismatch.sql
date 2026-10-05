-- Read-only: compares profiles.referral_count (used for Top Referrers list and
-- bonus-tier decisions) against the actual row count in public.referrals, for
-- every user who has at least one of the two.
SELECT p.id, p.full_name, p.phone,
       p.referral_count AS stored_referral_count,
       count(r.id) AS actual_referrals_rows,
       p.referral_count - count(r.id) AS difference
FROM public.profiles p
LEFT JOIN public.referrals r ON r.referrer_id = p.id
WHERE coalesce(p.referral_count, 0) > 0 OR EXISTS (
  SELECT 1 FROM public.referrals r2 WHERE r2.referrer_id = p.id
)
GROUP BY p.id, p.full_name, p.phone, p.referral_count
HAVING p.referral_count IS DISTINCT FROM count(r.id)
ORDER BY difference DESC;
