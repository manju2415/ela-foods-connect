-- protect_profile_privileged_fields_trg (added in
-- 20260906040000_protect_profile_privileged_fields.sql) has been rejecting
-- EVERY profile update made by an ordinary signed-in user (not an admin or
-- service_role caller) since it was deployed: it assigns
-- NEW.admin_deleted_at := OLD.admin_deleted_at, but admin_deleted_at was
-- only ever added to public.orders (20260906030000_admin_delete_order.sql)
-- — public.profiles has no such column. Postgres raises
-- 42703 "record 'new' has no field 'admin_deleted_at'" on the assignment,
-- which aborts the whole UPDATE. Confirmed live: replaying the exact update
-- CompleteRegistration.tsx performs against a real non-admin session
-- reproduced this error verbatim. This is what broke new-member sign-up
-- ("failed to save details") and would equally break any other place a
-- customer edits their own profile (name, phone, avatar, bank details).
-- Fix: drop the one erroneous line; every other protected column below
-- (user_level, is_designated_founder, founder_status, registration_fee_paid,
-- referred_by, referral_count, is_active) does exist on profiles and is
-- left exactly as before.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF coalesce(v_claim_role, 'anon') = 'service_role' OR public.is_any_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  NEW.user_level := OLD.user_level;
  NEW.is_designated_founder := OLD.is_designated_founder;
  NEW.founder_status := OLD.founder_status;
  NEW.registration_fee_paid := OLD.registration_fee_paid;
  NEW.referred_by := OLD.referred_by;
  NEW.referral_count := OLD.referral_count;
  NEW.is_active := OLD.is_active;

  RETURN NEW;
END;
$$;
