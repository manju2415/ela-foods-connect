-- Read-only: identifies matching accounts and the direct referrals qualifying them.
SELECT p.id, p.full_name, p.phone, p.user_level AS stored_level,
       p.registration_fee_paid,
       count(c.id) FILTER (WHERE coalesce(c.registration_fee_paid, 0) > 0) AS paid_direct_referrals,
       CASE WHEN coalesce(p.registration_fee_paid, 0) <= 0 THEN 'No role'
            WHEN p.user_level = 'founder' THEN 'Founder'
            WHEN count(c.id) FILTER (WHERE coalesce(c.registration_fee_paid, 0) > 0) > 0 THEN 'Master'
            ELSE 'Associate' END AS eligible_level,
       coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.full_name,
         'membership_fee_paid', c.registration_fee_paid)) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS direct_invitees
FROM public.profiles p
LEFT JOIN public.profiles c ON c.referred_by = p.id AND c.id <> p.id
WHERE p.full_name ILIKE '%soman%'
GROUP BY p.id, p.full_name, p.phone, p.user_level, p.registration_fee_paid;
