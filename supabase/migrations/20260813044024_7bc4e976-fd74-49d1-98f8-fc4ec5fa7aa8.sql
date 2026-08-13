ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accepted_agreement_at TIMESTAMP WITH TIME ZONE;

UPDATE public.profiles p
SET user_level = 'founder',
    is_designated_founder = true,
    founder_status = 'active'
WHERE COALESCE(p.registration_fee_paid, 0) > 0
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'founding_member'
  );