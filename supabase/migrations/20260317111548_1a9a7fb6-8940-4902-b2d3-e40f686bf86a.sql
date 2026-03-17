
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_role app_role;
BEGIN
  v_phone := COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone');

  -- Determine role based on phone number
  IF v_phone IN ('+919999000001', '919999000001', '9999000001',
                 '+919108682966', '919108682966', '9108682966') THEN
    v_role := 'super_admin';
  ELSIF v_phone IN ('+919999000002', '919999000002', '9999000002') THEN
    v_role := 'admin';
  ELSIF v_phone IN ('+919999000003', '919999000003', '9999000003') THEN
    v_role := 'founding_member';
  ELSIF v_phone IN ('+919999000004', '919999000004', '9999000004') THEN
    v_role := 'delivery_partner';
  ELSE
    v_role := 'member';
  END IF;

  -- Insert role (ignore if already exists)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create profile
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

  -- If founding_member, set user_level to founder
  IF v_role = 'founding_member' THEN
    UPDATE public.profiles SET user_level = 'founder', is_designated_founder = true WHERE id = NEW.id;
  END IF;

  -- If delivery_partner, create delivery_partners record
  IF v_role = 'delivery_partner' THEN
    INSERT INTO public.delivery_partners (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
