CREATE OR REPLACE FUNCTION public.tag_profile_mlm_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.mlm_settings_version_id IS NULL THEN
    SELECT id INTO NEW.mlm_settings_version_id
    FROM public.mlm_settings_versions
    ORDER BY effective_from DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tag_profile_mlm_version_trigger ON public.profiles;
CREATE TRIGGER tag_profile_mlm_version_trigger
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tag_profile_mlm_version();