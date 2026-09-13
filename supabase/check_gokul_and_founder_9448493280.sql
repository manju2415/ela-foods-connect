-- Read-only: state check before mapping Gokul MD under the founder at 9448493280.

-- 1. Gokul's current state
SELECT id, full_name, phone, user_level, referred_by, registration_fee_paid
FROM public.profiles
WHERE phone ILIKE '%8095292450%';

-- 2. Does Gokul already have a referrals-table row (i.e. was a referral ever processed for him)?
SELECT r.*
FROM public.referrals r
JOIN public.profiles p ON p.id = r.referred_id
WHERE p.phone ILIKE '%8095292450%';

-- 3. Target founder's state + active referral code
SELECT p.id, p.full_name, p.phone, p.user_level, p.is_designated_founder,
       rc.code AS referral_code, rc.is_active
FROM public.profiles p
LEFT JOIN public.referral_codes rc ON rc.user_id = p.id AND rc.is_active = true
WHERE p.phone ILIKE '%9448493280%';
