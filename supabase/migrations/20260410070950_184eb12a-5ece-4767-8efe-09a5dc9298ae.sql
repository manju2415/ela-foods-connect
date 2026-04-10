DELETE FROM public.user_roles ur
USING public.profiles p
WHERE ur.user_id = p.id
  AND p.phone = '+919999000005';

DELETE FROM public.user_roles ur
USING public.profiles p
WHERE ur.user_id = p.id
  AND p.phone = '+919999000006';

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'member'::public.app_role
FROM public.profiles p
WHERE p.phone = '+919999000006'
ON CONFLICT (user_id, role) DO NOTHING;