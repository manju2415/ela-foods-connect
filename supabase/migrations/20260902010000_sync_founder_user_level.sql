-- The `founding_member` role in user_roles is the authoritative record of who
-- is a designated founder (admin's "Founders" page caps this at 4 and manages
-- it there). profiles.user_level / is_designated_founder are denormalized
-- copies that a founder can end up out of sync with — which was undercounting
-- founders in the admin network dashboards, and, more importantly, means
-- process_mlm_referral() pays such a founder the regular master/associate
-- referral bonus instead of the founder-tier bonus (it branches on
-- profiles.user_level, not on user_roles). Backfill any drift.
UPDATE public.profiles p
SET user_level = 'founder',
    is_designated_founder = true
FROM public.user_roles ur
WHERE ur.user_id = p.id
  AND ur.role = 'founding_member'
  AND (p.user_level IS DISTINCT FROM 'founder' OR p.is_designated_founder IS DISTINCT FROM true);
