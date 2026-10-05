  -- Adds the missing public.referrals row so Gokul MD shows up in Shyju's
  -- "Referrals" tab/count in the admin dashboard. No wallet/commission impact:
  -- incentive_paid is set to false because no bonus was actually credited to Shyju
  -- for this signup (we deliberately skipped process_mlm_referral earlier).
  BEGIN;
  SET LOCAL request.jwt.claim.role = 'service_role';

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code_id, incentive_paid)
  SELECT 'f1d66197-5dbd-4b1c-9044-54b6edb4a13f',              -- Shyju
        'cd2feed3-da53-414e-89f3-72dd34c20ee9',               -- Gokul MD
        rc.id,
        false
  FROM public.referral_codes rc
  WHERE rc.user_id = 'f1d66197-5dbd-4b1c-9044-54b6edb4a13f'
    AND rc.code = 'ELA03O8UZ'
  ON CONFLICT DO NOTHING;

  -- Verify
  SELECT * FROM public.referrals
  WHERE referrer_id = 'f1d66197-5dbd-4b1c-9044-54b6edb4a13f'
    AND referred_id = 'cd2feed3-da53-414e-89f3-72dd34c20ee9';

  COMMIT;
