INSERT INTO public.user_roles (user_id, role)
SELECT id, 'mlm_admin'::app_role
FROM profiles
WHERE phone LIKE '%9999000003%'
ON CONFLICT (user_id, role) DO NOTHING;