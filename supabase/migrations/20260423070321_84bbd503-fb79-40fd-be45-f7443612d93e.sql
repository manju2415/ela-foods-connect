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
                 '+918050090300', '918050090300', '8050090300') THEN
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

CREATE OR REPLACE FUNCTION public.is_mlm_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'mlm_admin'
  )
$function$;