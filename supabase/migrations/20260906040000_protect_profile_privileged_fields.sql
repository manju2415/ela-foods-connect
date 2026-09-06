-- "Users can update their own profile" has USING (auth.uid() = id) but no
-- WITH CHECK and no column restriction, so a logged-in user's own client
-- could update ANY column on their own row via a direct PostgREST request —
-- including registration_fee_paid, founder_status, user_level,
-- is_designated_founder, referred_by, referral_count, is_active, and
-- admin_deleted_at. A BEFORE UPDATE trigger enforces this instead of trying
-- to express per-column logic in RLS (which only sees old vs. new rows via
-- USING/WITH CHECK on the whole row, not per-column): for a non-admin,
-- non-service-role caller, each protected column is forced back to its old
-- value, silently ignoring that part of the update rather than rejecting the
-- whole request (so an ordinary profile edit — name, phone, avatar, bank
-- details — still succeeds; only the privileged fields refuse to move).
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
  NEW.admin_deleted_at := OLD.admin_deleted_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_privileged_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();
