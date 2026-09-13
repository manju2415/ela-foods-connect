-- Read-only: finds the account for phone 8095292450 / name "gokul md" and who it is mapped under (upline).
SELECT p.id, p.full_name, p.phone, p.user_level,
       p.referred_by AS upline_id,
       up.full_name AS upline_name,
       up.phone AS upline_phone
FROM public.profiles p
LEFT JOIN public.profiles up ON up.id = p.referred_by
WHERE p.phone ILIKE '%8095292450%'
   OR p.full_name ILIKE '%gokul%';
