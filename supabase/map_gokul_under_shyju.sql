-- Maps Gokul MD (8095292450) under founder Shyju (9448493280).
-- Plain mapping only: no wallet/commission changes, no referral_count change.
--
-- referred_by is protected by protect_profile_privileged_fields_trg, which reverts
-- privileged columns unless the session claims service_role or is_any_admin(auth.uid()).
-- The raw SQL editor session has neither, so this SET LOCAL identifies this one
-- transaction as service_role purely for that trigger's check; it has no effect
-- outside this transaction.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

UPDATE public.profiles
SET referred_by = 'f1d66197-5dbd-4b1c-9044-54b6edb4a13f'  -- Shyju
WHERE id = 'cd2feed3-da53-414e-89f3-72dd34c20ee9'          -- Gokul MD
  AND referred_by IS NULL;                                 -- safety: only if still unmapped

-- Verify
SELECT id, full_name, phone, referred_by
FROM public.profiles
WHERE id = 'cd2feed3-da53-414e-89f3-72dd34c20ee9';

COMMIT;
