
-- Remove spurious 'member' roles from non-member test accounts
DELETE FROM user_roles WHERE id IN (
  '3f460b55-c254-4e57-b79e-652ff750c2dd',
  '845d10ce-9ff9-44ec-a79e-b41a233f7c2b',
  '7f3f57c8-5e2e-49ae-9b30-407de304b059',
  '123b4555-649a-4cbb-9632-fa58bbe8270d',
  'e1d73c65-bb7e-4917-82c7-8116914dce55',
  'a53f3ed3-eccf-4094-b1d0-547d9dd72491'
);

-- Add missing mlm_admin role for 9999000003
INSERT INTO user_roles (user_id, role)
VALUES ('0f7d4cf2-10d0-4e79-9cf5-741d47a512ce', 'mlm_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Fix trigger to not assign 'member' to known test accounts
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
  v_role app_role;
  v_skip_role boolean := false;
BEGIN
  v_phone := COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone');

  IF v_phone IN ('+919999000001', '919999000001', '9999000001',
                 '+919108682966', '919108682966', '9108682966') THEN
    v_role := 'super_admin';
  ELSIF v_phone IN ('+919999000002', '919999000002', '9999000002') THEN
    v_role := 'admin';
  ELSIF v_phone IN ('+919999000003', '919999000003', '9999000003') THEN
    v_role := 'founding_member';
  ELSIF v_phone IN ('+919999000004', '919999000004', '9999000004') THEN
    v_role := 'delivery_partner';
  ELSIF v_phone IN ('+919999000005', '919999000005', '9999000005') THEN
    v_skip_role := true;
  ELSIF v_phone IN ('+919999000006', '919999000006', '9999000006') THEN
    v_role := 'member';
  ELSE
    v_skip_role := true;
  END IF;

  IF NOT v_skip_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- For test phone 9999000003, also assign mlm_admin role
  IF v_phone IN ('+919999000003', '919999000003', '9999000003') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'mlm_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    v_phone
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    full_name = CASE WHEN profiles.full_name = '' OR profiles.full_name IS NULL
                     THEN EXCLUDED.full_name ELSE profiles.full_name END;

  IF v_role = 'founding_member' THEN
    UPDATE public.profiles SET user_level = 'founder', is_designated_founder = true WHERE id = NEW.id;
  END IF;

  IF v_role = 'delivery_partner' THEN
    INSERT INTO public.delivery_partners (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
